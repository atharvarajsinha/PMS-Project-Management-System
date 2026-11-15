"""Student portal: my project subjects, my teams, invites, mentor choice and submissions.

Students never see marks.
"""

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import SemesterSubject
from apps.accounts.models import Student
from apps.common import audit
from apps.common.permissions import IsStudent
from apps.common.tenancy import CollegeScopedMixin
from apps.projects import services as project_services
from apps.projects.models import Phase, PhaseSubmission
from apps.projects.serializers import SubmissionSerializer, SubmissionWriteSerializer

from . import services
from .models import Team, TeamInvite
from .serializers import (
    AvailableMentorSerializer,
    InviteHistorySerializer,
    InviteIdSerializer,
    MentorHistorySerializer,
    MentorRequestSerializer,
    OfferingBriefSerializer,
    StudentBriefSerializer,
    StudentIdSerializer,
    TeamSerializer,
    phases_of,
    team_queryset,
)
from .views import team_snapshot, unassigned_students


class StudentMixin(CollegeScopedMixin):
    permission_classes = [IsStudent]

    @cached_property
    def student(self):
        return get_object_or_404(Student.objects.select_related("user", "section__semester"), user=self.request.user)


def team_settings(college):
    s = college.settings
    return {
        "team_formation_enabled": s.team_formation_enabled,
        "teams_locked": s.teams_locked,
        "min_team_size": s.min_team_size,
        "max_team_size": s.max_team_size,
    }


def phase_rows(team, semester_subject_id):
    """Phases of the offering with this team's submission and evaluation progress (never marks).

    Submission window: start_date .. end_date. Evaluation window: the day after end_date ..
    evaluation_end_date (open-ended until locked when not set). Evaluation is COMPLETED once the
    evaluator has submitted marks.
    """
    from datetime import timedelta

    from apps.common.choices import EvaluationProgress, SubmissionProgress
    from apps.evaluations.models import Evaluation

    submissions, evaluated = {}, set()
    if team is not None:
        submissions = {s.phase_id: s for s in PhaseSubmission.objects.filter(team=team).prefetch_related("links")}
        evaluated = set(
            Evaluation.objects.filter(assignment__team=team, status=Evaluation.Status.SUBMITTED).values_list(
                "assignment__phase_id", flat=True
            )
        )
    rows = []
    for phase in phases_of(semester_subject_id):
        sub = submissions.get(phase.id)
        rows.append(
            {
                "id": phase.id,
                "name": phase.name,
                "short_description": phase.short_description,
                "description": phase.description,
                "order": phase.order,
                "start_date": phase.start_date,
                "end_date": phase.end_date,
                "max_marks": phase.max_marks,
                "status": phase.effective_status(),
                "submission": SubmissionSerializer(sub).data if sub else None,
                "submission_progress": SubmissionProgress.SUBMITTED
                if sub is not None and sub.is_submitted
                else SubmissionProgress.PENDING,
                "evaluation_start_date": phase.end_date + timedelta(days=1),
                "evaluation_end_date": phase.evaluation_end_date,
                "evaluation_progress": EvaluationProgress.COMPLETED
                if phase.id in evaluated
                else EvaluationProgress.PENDING,
            }
        )
    return rows


@extend_schema(tags=["student-portal"], responses={200: dict})
class MyProjectsView(StudentMixin, APIView):
    """GET /my/projects/ — every subject I take, with my team (or invites) and its phases."""

    def get(self, request):
        student = self.student
        offerings = (
            SemesterSubject.objects.filter(section_subjects__section_id=student.section_id)
            .select_related("semester", "subject")
            .order_by("subject__code")
        )
        teams = {
            t.semester_subject_id: t
            for t in team_queryset().filter(members__student=student, semester_subject__in=offerings)
        }
        invites = {}
        for invite in (
            TeamInvite.objects.filter(student=student, status=TeamInvite.Status.PENDING)
            .select_related("team__lead__user", "team__semester_subject")
        ):
            invites.setdefault(invite.team.semester_subject_id, []).append(
                {
                    "id": invite.id,
                    "team_id": invite.team_id,
                    "team_name": invite.team.display_name,
                    "lead": invite.team.lead.user.name,
                    "created_at": invite.created_at,
                }
            )
        context = {"college": self.college, "request": request}
        results = []
        for offering in offerings:
            team = teams.get(offering.id)
            is_lead = team is not None and team.lead_id == student.id
            results.append(
                {
                    "semester_subject": OfferingBriefSerializer(offering).data,
                    "team": TeamSerializer(team, context={**context, "show_invites": is_lead}).data if team else None,
                    "is_lead": is_lead,
                    "invites": invites.get(offering.id, []),
                    "phases": phase_rows(team, offering.id),
                }
            )
        return Response({"settings": team_settings(self.college), "student": StudentBriefSerializer(student).data, "subjects": results})


@extend_schema(tags=["student-portal"])
class MyTeamViewSet(StudentMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """/my/teams/ — teams I'm in. The Team Lead manages members, invites and the mentor request."""

    serializer_class = TeamSerializer
    ordering = ["semester_subject__subject__code"]
    ordering_aliases = {}
    search_fields = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Team.objects.none()
        return team_queryset().filter(members__student=self.student)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.kwargs.get("pk") and not getattr(self, "swagger_fake_view", False):
            team = Team.objects.filter(pk=self.kwargs["pk"]).only("lead_id").first()
            context["show_invites"] = bool(team and team.lead_id == self.student.id)
        return context

    def _team(self, lead_only=False):
        team = get_object_or_404(
            Team.objects.select_related("semester_subject__semester__college", "semester_subject__subject", "lead__user"),
            pk=self.kwargs["pk"],
            members__student=self.student,
        )
        if lead_only and team.lead_id != self.student.id:
            raise PermissionDenied("Only the Team Lead can do this.")
        return team

    def _respond(self, team, code=status.HTTP_200_OK):
        return Response(self.get_serializer(self.get_queryset().get(pk=team.pk)).data, status=code)

    @extend_schema(request=serializers.Serializer, responses={201: TeamSerializer})
    def create(self, request):
        """POST {semester_subject_id} — create a team; I become its Team Lead."""
        offering = get_object_or_404(
            SemesterSubject.objects.select_related("semester__college", "subject"),
            pk=request.data.get("semester_subject_id") or 0,
            semester__college=self.college,
        )
        team = services.create_team(offering, self.student, request.user)
        audit.record(request, "team.create", team, new=team_snapshot(team))
        return self._respond(team, status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        """Team Lead disbands the team (before the lock, nothing submitted yet)."""
        team = self._team(lead_only=True)
        audit.record(request, "team.disband", team, old=team_snapshot(team))
        services.delete_team(team)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # members ----------------------------------------------------------------
    @extend_schema(
        responses={200: StudentBriefSerializer(many=True)}, parameters=[OpenApiParameter("search", str)]
    )
    @action(detail=True, methods=["get"], url_path="eligible-students", search_fields=[], ordering_aliases={})
    def eligible_students(self, request, pk=None):
        """Students I can invite: they take this subject and have no team for it yet."""
        team = self._team(lead_only=True)
        qs = unassigned_students(team.semester_subject).filter(user__status="ACTIVE")
        term = (request.query_params.get("search") or "").strip()
        if term:
            qs = qs.filter(Q(user__name__icontains=term) | Q(roll_number__icontains=term))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(StudentBriefSerializer(page, many=True).data)

    @extend_schema(request=StudentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"])
    def invite(self, request, pk=None):
        team = self._team(lead_only=True)
        serializer = StudentIdSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        invite = services.invite(team, serializer.validated_data["student_id"], request.user)
        audit.record(request, "team.invite", invite, new={"team": team.pk, "student": invite.student_id})
        return self._respond(team)

    @extend_schema(request=InviteIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="cancel-invite")
    def cancel_invite(self, request, pk=None):
        team = self._team(lead_only=True)
        serializer = InviteIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invite = get_object_or_404(TeamInvite, pk=serializer.validated_data["invite_id"], team=team)
        services.cancel_invite(invite)
        audit.record(request, "team.invite_cancel", invite)
        return self._respond(team)

    @extend_schema(request=StudentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="remove-member")
    def remove_member(self, request, pk=None):
        team = self._team(lead_only=True)
        serializer = StudentIdSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        old = team_snapshot(team)
        services.remove_member(team, serializer.validated_data["student_id"])
        audit.record(request, "team.remove_member", team, old=old, new=team_snapshot(team))
        return self._respond(team)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        team = self._team()
        old = team_snapshot(team)
        services.remove_member(team, self.student)
        audit.record(request, "team.leave", team, old=old, new=team_snapshot(team))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=StudentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="change-lead")
    def change_lead(self, request, pk=None):
        team = self._team(lead_only=True)
        serializer = StudentIdSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        old = {"lead": team.lead_id}
        services.change_lead(team, serializer.validated_data["student_id"])
        audit.record(request, "team.change_lead", team, old=old, new={"lead": team.lead_id})
        return self._respond(team)

    # mentor -----------------------------------------------------------------
    @extend_schema(responses={200: AvailableMentorSerializer(many=True)})
    @action(detail=True, methods=["get"], search_fields=[], ordering_aliases={})
    def mentors(self, request, pk=None):
        """This semester's mentor list, each marked available or full (no slot counts)."""
        team = self._team()
        rows = services.mentors_with_load(team.semester_subject.semester_id).filter(faculty__user__status="ACTIVE").order_by("faculty__user__name")
        return Response(AvailableMentorSerializer(rows, many=True).data)

    @extend_schema(responses={200: InviteHistorySerializer(many=True)})
    @action(detail=True, methods=["get"], url_path="invite-history", search_fields=[], ordering_aliases={})
    def invite_history(self, request, pk=None):
        """Team Lead: every invite sent and whether it was accepted, declined or cancelled."""
        team = self._team(lead_only=True)
        rows = team.invites.select_related("student__user", "student__section", "invited_by").order_by("-created_at")
        return Response(InviteHistorySerializer(rows, many=True).data)

    @extend_schema(responses={200: MentorHistorySerializer(many=True)})
    @action(detail=True, methods=["get"], url_path="mentor-requests", search_fields=[], ordering_aliases={})
    def mentor_requests(self, request, pk=None):
        """Team Lead: every mentor request of the team and how each mentor answered."""
        team = self._team(lead_only=True)
        rows = (
            team.mentor_assignments.select_related("faculty__user", "team__semester_subject__subject", "team__semester_subject__semester")
            .prefetch_related("team__members__student__user")
            .order_by("-created_at")
        )
        return Response(MentorHistorySerializer(rows, many=True).data)

    @extend_schema(request=MentorRequestSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="request-mentor")
    def request_mentor(self, request, pk=None):
        team = self._team(lead_only=True)
        serializer = MentorRequestSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        assignment = services.request_mentor(team, serializer.validated_data["faculty_id"], request.user)
        audit.record(request, "mentor.request", assignment, new={"team": team.pk, "faculty": assignment.faculty_id})
        return self._respond(team)

    @extend_schema(request=None, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="cancel-mentor-request")
    def cancel_mentor_request(self, request, pk=None):
        team = self._team(lead_only=True)
        assignment = services.cancel_mentor_request(team)
        audit.record(request, "mentor.request_cancel", assignment)
        return self._respond(team)

    # submissions ------------------------------------------------------------
    @extend_schema(responses={200: dict})
    @action(detail=True, methods=["get"], search_fields=[], ordering_aliases={})
    def phases(self, request, pk=None):
        team = self._team()
        return Response(phase_rows(team, team.semester_subject_id))

    @extend_schema(methods=["PUT"], request=SubmissionWriteSerializer, responses={200: SubmissionSerializer})
    @extend_schema(methods=["GET"], responses={200: SubmissionSerializer})
    @action(detail=True, methods=["get", "put"], url_path=r"phases/(?P<phase_id>\d+)/submission")
    def submission(self, request, pk=None, phase_id=None):
        """Any member may save the team's links for a phase while it is OPEN."""
        team = self._team()
        phase = get_object_or_404(Phase, pk=phase_id, semester_subject_id=team.semester_subject_id)
        if request.method == "GET":
            sub = PhaseSubmission.objects.filter(team=team, phase=phase).prefetch_related("links").first()
            return Response(SubmissionSerializer(sub).data if sub else None)
        serializer = SubmissionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        sub, old = project_services.save_submission(
            team, phase, self.student, links=data["links"], notes=data.get("notes"), submit=data["submit"]
        )
        audit.record(
            request, "submission.submit" if data["submit"] else "submission.save_draft", sub,
            old=old, new={"status": sub.status, "links": [link["url"] for link in data["links"]]},
        )
        sub = PhaseSubmission.objects.prefetch_related("links").get(pk=sub.pk)
        return Response(SubmissionSerializer(sub).data)


@extend_schema(tags=["student-portal"])
class MyInviteViewSet(StudentMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    """/my/invites/ — pending invites to join a team."""

    ordering = ["-created_at"]
    ordering_aliases = {}
    search_fields = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TeamInvite.objects.none()
        return TeamInvite.objects.filter(student=self.student, status=TeamInvite.Status.PENDING).select_related(
            "team__lead__user", "team__semester_subject__subject"
        )

    def get_serializer_class(self):
        return InviteListSerializer

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        invite = get_object_or_404(self.get_queryset(), pk=pk)
        services.respond_invite(invite, accept=True)
        audit.record(request, "team.invite_accept", invite, new={"team": invite.team_id})
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def decline(self, request, pk=None):
        invite = get_object_or_404(self.get_queryset(), pk=pk)
        services.respond_invite(invite, accept=False)
        audit.record(request, "team.invite_decline", invite, new={"team": invite.team_id})
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteListSerializer(serializers.ModelSerializer):
    team_id = serializers.IntegerField()
    team_name = serializers.CharField(source="team.display_name")
    lead = serializers.CharField(source="team.lead.user.name")
    subject = serializers.SerializerMethodField()

    class Meta:
        model = TeamInvite
        fields = ["id", "team_id", "team_name", "lead", "subject", "created_at"]

    def get_subject(self, invite) -> dict:
        s = invite.team.semester_subject.subject
        return {"id": s.id, "code": s.code, "name": s.name}
