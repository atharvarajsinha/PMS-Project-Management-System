"""College Admin: semester mentor lists and team management (incl. locked teams)."""

import django_filters
from django.db.models import Count, Exists, F, OuterRef, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.models import Semester, SemesterSubject
from apps.accounts.models import Faculty, Student
from apps.common import audit
from apps.common.bulk import BulkDeleteMixin
from apps.common.choices import MENTOR_ACTIVE_STATUSES
from apps.common.exceptions import Conflict, HasDependents, InvalidInput
from apps.common.permissions import IsCollegeAdmin
from apps.common.tenancy import CollegeScopedMixin
from apps.evaluations import services as evaluation_services
from apps.evaluations.models import EvaluatorAssignment

from . import services
from .models import MentorAssignment, SemesterMentor, Team, TeamMember
from .serializers import (
    AssignmentIdSerializer,
    EvaluatorOverrideSerializer,
    MentorAssignSerializer,
    SemesterMentorCreateSerializer,
    SemesterMentorSerializer,
    SemesterMentorUpdateSerializer,
    StudentBriefSerializer,
    StudentIdSerializer,
    TeamCreateSerializer,
    TeamEditSerializer,
    TeamNameSerializer,
    TeamSerializer,
    phases_of,
    team_queryset,
)


def team_snapshot(team):
    return {
        "name": team.name,
        "lead": team.lead_id,
        "members": sorted(team.members.values_list("student_id", flat=True)),
    }


# ---------------------------------------------------------------- mentor list


class SemesterMentorFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="semester_id")

    class Meta:
        model = SemesterMentor
        fields = ["semester_id"]


@extend_schema(tags=["mentors"])
class SemesterMentorViewSet(
    BulkDeleteMixin,
    CollegeScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """/semester-mentors/ — which faculty may mentor in a semester, with capacity and current load."""

    permission_classes = [IsCollegeAdmin]
    serializer_class = SemesterMentorSerializer
    filterset_class = SemesterMentorFilter
    search_fields = ["faculty__user__name", "faculty__user__email"]
    ordering_aliases = {"name": "faculty__user__name", "capacity": "capacity", "load": "load"}
    ordering = ["semester__semester_number", "faculty__user__name"]
    http_method_names = ["get", "post", "patch", "delete"]
    dependents_message = "{obj.faculty.user.name} still mentors teams (or has pending requests) this semester."

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return SemesterMentor.objects.none()
        semester_id = self.request.query_params.get("semester_id")
        # counted per row's own semester; capacity is used by accepted teams only
        in_semester = Q(faculty__mentor_assignments__team__semester_subject__semester_id=F("semester_id"))
        accepted = Q(faculty__mentor_assignments__status=MentorAssignment.Status.ACCEPTED)
        pending = Q(faculty__mentor_assignments__status=MentorAssignment.Status.PENDING)
        return (
            SemesterMentor.objects.filter(semester__college=self.college)
            .select_related("faculty__user", "semester")
            .annotate(
                load=Count("faculty__mentor_assignments", filter=in_semester & accepted, distinct=True),
                accepted=Count("faculty__mentor_assignments", filter=in_semester & accepted, distinct=True),
                pending=Count("faculty__mentor_assignments", filter=in_semester & pending, distinct=True),
            )
        )

    @extend_schema(request=SemesterMentorCreateSerializer, responses={201: dict})
    def create(self, request):
        """Add one or more faculty to a semester's mentor list (already-listed ones are skipped)."""
        serializer = SemesterMentorCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        semester = get_object_or_404(Semester, pk=data["semester_id"], college=self.college)
        capacity = data.get("capacity") or self.college.settings.default_mentor_capacity
        faculty = {f.pk: f for f in Faculty.objects.filter(college=self.college, pk__in=data["faculty_ids"])}
        listed = set(SemesterMentor.objects.filter(semester=semester).values_list("faculty_id", flat=True))
        created, failed = [], []
        for pk in dict.fromkeys(data["faculty_ids"]):
            if pk not in faculty:
                failed.append({"id": pk, "code": "NOT_FOUND", "message": "Not found."})
            elif pk in listed:
                failed.append({"id": pk, "code": "CONFLICT", "message": f"{faculty[pk].user.name} is already on the list."})
            else:
                slot = SemesterMentor.objects.create(
                    semester=semester, faculty=faculty[pk], capacity=capacity, added_by=request.user
                )
                audit.record(request, "semester_mentor.create", slot, new={"semester": semester.pk, "faculty": pk, "capacity": capacity})
                created.append(slot.pk)
        rows = self.get_queryset().filter(pk__in=created)
        return Response(
            {"created": SemesterMentorSerializer(rows, many=True).data, "failed": failed}, status=status.HTTP_201_CREATED
        )

    @extend_schema(request=SemesterMentorUpdateSerializer, responses={200: SemesterMentorSerializer})
    def partial_update(self, request, pk=None):
        slot = self.get_object()
        serializer = SemesterMentorUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        capacity = serializer.validated_data["capacity"]
        # Admin override: capacity may go below the current load (existing teams stay; no new ones)
        old = {"capacity": slot.capacity}
        slot.capacity = capacity
        slot.save(update_fields=["capacity", "updated_at"])
        audit.record(request, "semester_mentor.update", slot, old=old, new={"capacity": capacity})
        for a in services.reject_pending_if_full(slot):  # lowered to exactly the load: close the waiting list
            audit.record(request, "mentor.auto_reject", a, new={"team": a.team_id, "reason": "mentor full"})
        return Response(self.get_serializer(self.get_queryset().get(pk=slot.pk)).data)

    def perform_destroy(self, instance):
        active = MentorAssignment.objects.filter(
            faculty_id=instance.faculty_id,
            team__semester_subject__semester_id=instance.semester_id,
            status__in=MENTOR_ACTIVE_STATUSES,
        ).exists()
        if active:
            raise HasDependents(self.dependents_message.format(obj=instance))
        audit.record(self.request, "semester_mentor.delete", instance, old={"semester": instance.semester_id, "faculty": instance.faculty_id})
        instance.delete()


# ---------------------------------------------------------------- teams


class TeamFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="semester_subject__semester_id")
    semester_subject_id = django_filters.NumberFilter(field_name="semester_subject_id")
    subject_id = django_filters.NumberFilter(field_name="semester_subject__subject_id")
    section_id = django_filters.NumberFilter(method="filter_section")
    mentor_id = django_filters.NumberFilter(method="filter_mentor")
    evaluator_id = django_filters.NumberFilter(method="filter_evaluator")
    has_mentor = django_filters.BooleanFilter(method="filter_has_mentor")
    mentor_pending = django_filters.BooleanFilter(method="filter_mentor_pending")
    evaluator_pending = django_filters.BooleanFilter(method="filter_evaluator_pending")
    incomplete = django_filters.BooleanFilter(method="filter_incomplete")

    class Meta:
        model = Team
        fields = ["semester_id", "semester_subject_id", "subject_id"]

    def filter_section(self, qs, name, value):
        return qs.filter(Exists(TeamMember.objects.filter(team=OuterRef("pk"), student__section_id=value)))

    def filter_mentor(self, qs, name, value):
        return qs.filter(
            Exists(MentorAssignment.objects.filter(team=OuterRef("pk"), faculty_id=value, status__in=MENTOR_ACTIVE_STATUSES))
        )

    def filter_evaluator(self, qs, name, value):
        return qs.filter(Exists(EvaluatorAssignment.objects.filter(team=OuterRef("pk"), evaluator_id=value)))

    def filter_has_mentor(self, qs, name, value):
        cond = Exists(
            MentorAssignment.objects.filter(team=OuterRef("pk"), status=MentorAssignment.Status.ACCEPTED)
        )
        return qs.filter(cond) if value else qs.exclude(cond)

    def filter_mentor_pending(self, qs, name, value):
        cond = Exists(MentorAssignment.objects.filter(team=OuterRef("pk"), status=MentorAssignment.Status.PENDING))
        return qs.filter(cond) if value else qs.exclude(cond)

    def filter_evaluator_pending(self, qs, name, value):
        cond = Exists(EvaluatorAssignment.objects.filter(team=OuterRef("pk"), evaluator__isnull=True))
        return qs.filter(cond) if value else qs.exclude(cond)

    def filter_incomplete(self, qs, name, value):
        college = self.request._pms_college
        minimum = college.settings.min_team_size
        return qs.filter(members_count__lt=minimum) if value else qs.filter(members_count__gte=minimum)


@extend_schema(tags=["teams"])
class TeamViewSet(BulkDeleteMixin, CollegeScopedMixin, viewsets.ModelViewSet):
    """/teams/ — the Admin sees and changes every team, locked or not."""

    permission_classes = [IsCollegeAdmin]
    serializer_class = TeamSerializer
    filterset_class = TeamFilter
    http_method_names = ["get", "post", "patch", "delete"]
    search_fields = ["name", "members__student__user__name", "members__student__roll_number", "semester_subject__subject__code"]
    ordering_aliases = {"name": "name", "created_at": "created_at", "members_count": "members_count"}
    ordering = ["semester_subject__semester__semester_number", "semester_subject__subject__code", "id"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Team.objects.none()
        return team_queryset().filter(semester_subject__semester__college=self.college).distinct()

    def _respond(self, team, code=status.HTTP_200_OK):
        return Response(self.get_serializer(self.get_queryset().get(pk=team.pk)).data, status=code)

    def _team(self):
        return get_object_or_404(Team.objects.select_related("semester_subject__semester", "semester_subject__subject"), pk=self.kwargs["pk"], semester_subject__semester__college=self.college)

    @extend_schema(request=TeamCreateSerializer, responses={201: TeamSerializer})
    def create(self, request):
        serializer = TeamCreateSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        team = services.create_team(
            data["semester_subject_id"], data["lead_id"], request.user, members=data["member_ids"], admin=True
        )
        audit.record(request, "team.create", team, new=team_snapshot(team))
        return self._respond(team, status.HTTP_201_CREATED)

    @extend_schema(request=TeamEditSerializer, responses={200: TeamSerializer})
    def partial_update(self, request, pk=None):
        """Name and project title/description (an Admin override at any time); use the actions for
        members, lead, mentors and evaluators."""
        team = self._team()
        serializer = TeamEditSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        old = {"name": team.name, "project_title": team.project_title, "project_description": team.project_description}
        if "name" in data:
            services.rename(team, data["name"], request.user)
        project = {k: data[k].strip() for k in ("project_title", "project_description") if k in data}
        if project:
            for field, value in project.items():
                setattr(team, field, value)
            team.save(update_fields=[*project, "updated_at"])
        new = {"name": team.name, "project_title": team.project_title, "project_description": team.project_description}
        audit.record(request, "team.update", team, old=old, new=new)
        return self._respond(team)

    def perform_destroy(self, instance):
        audit.record(self.request, "team.delete", instance, old=team_snapshot(instance))
        services.delete_team(instance, admin=True)

    # members ----------------------------------------------------------------
    @extend_schema(request=StudentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="add-member")
    def add_member(self, request, pk=None):
        team = self._team()
        serializer = StudentIdSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        old = team_snapshot(team)
        services.add_member(team, serializer.validated_data["student_id"])
        audit.record(request, "team.add_member", team, old=old, new=team_snapshot(team))
        return self._respond(team)

    @extend_schema(request=StudentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="remove-member")
    def remove_member(self, request, pk=None):
        team = self._team()
        serializer = StudentIdSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        old = team_snapshot(team)
        services.remove_member(team, serializer.validated_data["student_id"], admin=True)
        audit.record(request, "team.remove_member", team, old=old, new=team_snapshot(team))
        return self._respond(team)

    @extend_schema(request=StudentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="change-lead")
    def change_lead(self, request, pk=None):
        team = self._team()
        serializer = StudentIdSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        old = {"lead": team.lead_id}
        services.change_lead(team, serializer.validated_data["student_id"], admin=True)
        audit.record(request, "team.change_lead", team, old=old, new={"lead": team.lead_id})
        return self._respond(team)

    @extend_schema(
        responses={200: StudentBriefSerializer(many=True)},
        parameters=[
            OpenApiParameter("semester_subject_id", int, required=True),
            OpenApiParameter("search", str),
        ],
    )
    @action(detail=False, methods=["get"], url_path="unassigned-students", search_fields=[], ordering_aliases={})
    def unassigned_students(self, request):
        """Eligible students of an offering who are not in any of its teams (paginated)."""
        offering = get_object_or_404(
            SemesterSubject, pk=request.query_params.get("semester_subject_id") or 0, semester__college=self.college
        )
        qs = unassigned_students(offering)
        term = (request.query_params.get("search") or "").strip()
        if term:
            qs = qs.filter(Q(user__name__icontains=term) | Q(roll_number__icontains=term) | Q(user__email__icontains=term))
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(StudentBriefSerializer(page, many=True).data)

    # mentors ----------------------------------------------------------------
    @extend_schema(request=MentorAssignSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="assign-mentor")
    def assign_mentor(self, request, pk=None):
        team = self._team()
        serializer = MentorAssignSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        assignment, removed, auto_rejected = services.admin_assign_mentor(
            team, data["faculty_id"], request.user, replace=data["replace"], override_capacity=data["override_capacity"]
        )
        audit.record(
            request, "team.mentor_assign", team,
            old={"removed": [r.faculty_id for r in removed]},
            new={"faculty": assignment.faculty_id, "override_capacity": data["override_capacity"]},
        )
        for a in auto_rejected:
            audit.record(request, "mentor.auto_reject", a, new={"team": a.team_id, "reason": "mentor full"})
        return self._respond(team)

    @extend_schema(request=AssignmentIdSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="remove-mentor")
    def remove_mentor(self, request, pk=None):
        team = self._team()
        serializer = AssignmentIdSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = get_object_or_404(MentorAssignment, pk=serializer.validated_data["assignment_id"], team=team)
        services.admin_remove_mentor(assignment, request.user)
        audit.record(request, "team.mentor_remove", team, old={"faculty": assignment.faculty_id})
        return self._respond(team)

    # evaluators -------------------------------------------------------------
    @extend_schema(request=EvaluatorOverrideSerializer, responses={200: TeamSerializer})
    @action(detail=True, methods=["post"], url_path="set-evaluator")
    def set_evaluator(self, request, pk=None):
        """Override the evaluator for some or all phases; evaluator_id=null resets them to automatic."""
        team = self._team()
        serializer = EvaluatorOverrideSerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        evaluation_services.sync_team(team)  # make sure every phase has a row
        phases = phases_of(team.semester_subject_id)
        if data.get("phase_ids"):
            phases = phases.filter(pk__in=data["phase_ids"])
            if phases.count() != len(set(data["phase_ids"])):
                raise InvalidInput(details={"phase_ids": ["Some phases don't belong to this team's subject."]})
        else:
            phases = phases.filter(locked_at__isnull=True)
        changed = evaluation_services.override_evaluator(
            team, data["evaluator_id"], list(phases), request.user, self.college.settings
        )
        for assignment, old in changed:
            audit.record(
                request, "evaluator.override" if data["evaluator_id"] else "evaluator.reset", assignment,
                old=old, new={"evaluator": assignment.evaluator_id, "source": assignment.source},
            )
        return self._respond(team)


def unassigned_students(offering):
    return (
        Student.objects.filter(section__section_subjects__semester_subject=offering)
        .exclude(team_memberships__semester_subject=offering)
        .select_related("user", "section")
        .order_by("section__name", "roll_number")
        .distinct()
    )
