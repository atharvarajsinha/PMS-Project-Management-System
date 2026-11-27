"""Faculty portal for Phase 2.

- /my/mentoring/ — mentor requests to accept/reject, and the teams I mentor.
- /my/class-sections/{id}/teams/ — class teacher: each student of my section,
  their team per subject, its mentor(s) and the evaluator per phase.
- /my/class-sections/{id}/teams/{student}/ — one student in detail, including their marks per phase.
"""

from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import Section, SemesterSubject
from apps.accounts.models import Faculty, Student
from apps.common import audit
from apps.common.choices import MENTOR_ACTIVE_STATUSES, MentorStatus, TeamRole
from apps.common.permissions import IsFaculty
from apps.common.tenancy import CollegeScopedMixin

from . import services
from .models import MentorAssignment, TeamMember
from .serializers import (
    DecisionSerializer,
    MentorHistorySerializer,
    OfferingBriefSerializer,
    StudentBriefSerializer,
    TeamSerializer,
    team_queryset,
)
from .views_student import phase_rows


class FacultyMixin(CollegeScopedMixin):
    permission_classes = [IsFaculty]

    @cached_property
    def faculty(self):
        return get_object_or_404(Faculty.objects.select_related("user"), user=self.request.user)


@extend_schema(tags=["faculty-portal"])
class MyMentoringViewSet(FacultyMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    ordering = ["status", "-created_at"]
    ordering_aliases = {}
    search_fields = ["team__name", "team__members__student__user__name", "team__semester_subject__subject__code"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return MentorAssignment.objects.none()
        qs = MentorAssignment.objects.filter(faculty=self.faculty).select_related(
            "team__semester_subject__subject", "team__semester_subject__semester"
        )
        wanted = self.request.query_params.get("status")
        if wanted in MentorStatus.values:
            return qs.filter(status=wanted)
        return qs.filter(status__in=MENTOR_ACTIVE_STATUSES)

    def _rows(self, assignments, with_phases=False):
        teams = {t.pk: t for t in team_queryset().filter(pk__in=[a.team_id for a in assignments])}
        context = {"college": self.college, "request": self.request, "show_invites": False}
        rows = []
        for a in assignments:
            team = teams[a.team_id]
            row = {
                "id": a.id,
                "status": a.status,
                "note": a.note,
                "created_at": a.created_at,
                "decided_at": a.decided_at,
                "team": TeamSerializer(team, context=context).data,
            }
            if with_phases and a.status == MentorStatus.ACCEPTED:
                row["phases"] = phase_rows(team, team.semester_subject_id)
            rows.append(row)
        return rows

    @extend_schema(
        responses={200: dict}, parameters=[OpenApiParameter("status", str, enum=list(MentorStatus.values))]
    )
    def list(self, request):
        """Default: pending requests and teams I mentor. ?status= for one status (e.g. REJECTED)."""
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(self._rows(page))

    @extend_schema(responses={200: dict})
    def retrieve(self, request, pk=None):
        """One request/team, with the team's phases and submitted links once I've accepted."""
        assignment = get_object_or_404(MentorAssignment, pk=pk, faculty=self.faculty)
        return Response(self._rows([assignment], with_phases=True)[0])

    def _decide(self, request, pk, accept):
        assignment = get_object_or_404(MentorAssignment, pk=pk, faculty=self.faculty)
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment, auto_rejected = services.decide_mentor_request(assignment, accept, serializer.validated_data["note"])
        audit.record(request, "mentor.accept" if accept else "mentor.reject", assignment, new={"team": assignment.team_id})
        for a in auto_rejected:
            audit.record(request, "mentor.auto_reject", a, new={"team": a.team_id, "reason": "mentor full"})
        return Response(self._rows([assignment], with_phases=True)[0])

    @extend_schema(responses={200: MentorHistorySerializer(many=True)})
    @action(detail=False, methods=["get"], search_fields=[], ordering_aliases={})
    def history(self, request):
        """Every request I answered (or that ended): accepted, rejected (incl. automatic), cancelled, removed."""
        qs = (
            MentorAssignment.objects.filter(faculty=self.faculty)
            .exclude(status=MentorStatus.PENDING)
            .select_related("faculty__user", "team__semester_subject__subject", "team__semester_subject__semester")
            .prefetch_related(Prefetch("team__members", queryset=TeamMember.objects.select_related("student__user")))
            .order_by("-decided_at", "-created_at")
        )
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(MentorHistorySerializer(page, many=True).data)

    @extend_schema(request=DecisionSerializer, responses={200: dict})
    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        return self._decide(request, pk, True)

    @extend_schema(request=DecisionSerializer, responses={200: dict})
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._decide(request, pk, False)


@extend_schema(tags=["faculty-portal"], responses={200: dict})
class ClassSectionTeamsView(FacultyMixin, APIView):
    """GET /my/class-sections/{section_pk}/teams/ — where each of my students stands, per subject."""

    def get(self, request, section_pk):
        section = get_object_or_404(
            Section.objects.select_related("semester"), pk=section_pk, class_teacher__user=request.user
        )
        offerings = list(
            SemesterSubject.objects.filter(section_subjects__section=section)
            .select_related("semester", "subject")
            .order_by("subject__code")
        )
        students = list(
            Student.objects.filter(section=section).select_related("user", "section").order_by("roll_number")
        )
        memberships = TeamMember.objects.filter(student__in=students, semester_subject__in=offerings).values_list(
            "student_id", "semester_subject_id", "team_id"
        )
        teams = {t.pk: t for t in team_queryset().filter(pk__in={m[2] for m in memberships})}
        by_student = {(s, o): teams[t] for s, o, t in memberships}
        settings = self.college.settings

        def team_cell(student, offering):
            team = by_student.get((student.id, offering.id))
            if team is None:
                return None
            members = list(team.members.all())
            return {
                "id": team.id,
                "display_name": team.display_name,
                "role": TeamRole.LEAD if team.lead_id == student.id else TeamRole.MEMBER,
                "lead": team.lead.user.name,
                "members": [{"id": m.student_id, "name": m.student.user.name, "section": m.student.section.name} for m in members],
                "members_count": len(members),
                "is_complete": len(members) >= settings.min_team_size,
                "mentors": [
                    {"id": a.faculty_id, "name": a.faculty.user.name, "status": a.status}
                    for a in getattr(team, "active_mentors", [])
                ],
                "evaluators": [
                    {
                        "phase_id": a.phase_id,
                        "phase_name": a.phase.name,
                        "phase_status": a.phase.effective_status(),
                        "evaluator": {"id": a.evaluator_id, "name": a.evaluator.user.name} if a.evaluator_id else None,
                    }
                    for a in team.evaluator_assignments.all()
                ],
            }

        rows = [
            {
                "student": {**StudentBriefSerializer(s).data, "status": s.user.status},
                "teams": {str(o.id): team_cell(s, o) for o in offerings},
            }
            for s in students
        ]
        summary = [
            {
                "semester_subject_id": o.id,
                "in_team": sum(1 for s in students if (s.id, o.id) in by_student),
                "without_team": sum(1 for s in students if (s.id, o.id) not in by_student),
            }
            for o in offerings
        ]
        return Response(
            {
                "section": {"id": section.id, "name": section.name, "semester_number": section.semester.semester_number},
                "subjects": [OfferingBriefSerializer(o).data for o in offerings],
                "summary": summary,
                "students": rows,
            }
        )


@extend_schema(tags=["faculty-portal"], responses={200: dict})
class ClassStudentProjectView(FacultyMixin, APIView):
    """GET /my/class-sections/{section_pk}/teams/{student_pk}/ — one student of my section:
    every subject → team, mentor, and per phase the evaluator, progress and this student's marks."""

    def get(self, request, section_pk, student_pk):
        from apps.evaluations.models import EvaluatorAssignment, StudentMark

        section = get_object_or_404(Section, pk=section_pk, class_teacher__user=request.user)
        student = get_object_or_404(Student.objects.select_related("user", "section"), pk=student_pk, section=section)
        offerings = list(
            SemesterSubject.objects.filter(section_subjects__section=section)
            .select_related("semester", "subject")
            .order_by("subject__code")
        )
        teams = {
            t.semester_subject_id: t
            for t in team_queryset().filter(members__student=student, semester_subject__in=offerings)
        }
        assignments = {
            (a.team_id, a.phase_id): a
            for a in EvaluatorAssignment.objects.filter(team__in=teams.values()).select_related(
                "evaluator__user", "evaluation"
            )
        }
        marks = dict(
            StudentMark.objects.filter(student=student, evaluation__assignment__team__in=teams.values()).values_list(
                "evaluation__assignment_id", "marks"
            )
        )

        subjects = []
        for offering in offerings:
            team = teams.get(offering.id)
            phases, total, total_max = phase_rows(team, offering.id), 0, 0
            for row in phases:
                a = assignments.get((team.id, row["id"])) if team else None
                evaluation = getattr(a, "evaluation", None) if a else None
                mark = marks.get(a.id) if a else None
                row.pop("description", None)
                row["evaluator"] = {"id": a.evaluator_id, "name": a.evaluator.user.name} if a and a.evaluator_id else None
                row["marks"] = f"{mark:.2f}" if mark is not None else None
                row["evaluation_status"] = evaluation.status if evaluation else None
                row["remarks"] = evaluation.remarks if evaluation else ""
                if mark is not None:
                    total += mark
                    total_max += row["max_marks"]
            subjects.append(
                {
                    "semester_subject": OfferingBriefSerializer(offering).data,
                    "team": (
                        {
                            "id": team.id,
                            "display_name": team.display_name,
                            "role": TeamRole.LEAD if team.lead_id == student.id else TeamRole.MEMBER,
                            "lead": team.lead.user.name,
                            "members": [m.student.user.name for m in team.members.all()],
                            "mentors": [
                                {"id": m.faculty_id, "name": m.faculty.user.name, "status": m.status}
                                for m in getattr(team, "active_mentors", [])
                            ],
                        }
                        if team
                        else None
                    ),
                    "phases": phases,
                    "totals": {"marks": f"{total:.2f}", "max_marks": f"{total_max:.2f}"} if total_max else None,
                }
            )
        return Response({"student": {**StudentBriefSerializer(student).data, "status": student.user.status}, "subjects": subjects})


@extend_schema(tags=["faculty-portal"], responses={200: dict})
class ClassSectionMarksView(FacultyMixin, APIView):
    """GET /my/class-sections/{section_pk}/marks/ — class teacher: every student's marks, per subject
    and phase (one column per phase). `status` is the evaluation's status (DRAFT marks may still change)."""

    def get(self, request, section_pk):
        from apps.evaluations.models import StudentMark
        from apps.projects.models import Phase

        section = get_object_or_404(
            Section.objects.select_related("semester"), pk=section_pk, class_teacher__user=request.user
        )
        offerings = list(
            SemesterSubject.objects.filter(section_subjects__section=section)
            .select_related("semester", "subject")
            .order_by("subject__code")
        )
        students = list(
            Student.objects.filter(section=section).select_related("user", "section").order_by("roll_number")
        )
        phases = {}
        for phase in Phase.objects.filter(semester_subject__in=offerings).order_by("order", "start_date", "id"):
            phases.setdefault(phase.semester_subject_id, []).append(phase)
        memberships = dict(
            ((s, o), (t, name))
            for s, o, t, name in TeamMember.objects.filter(student__in=students, semester_subject__in=offerings).values_list(
                "student_id", "semester_subject_id", "team_id", "team__name"
            )
        )
        marks = {
            (m["student_id"], m["evaluation__assignment__phase_id"]): m
            for m in StudentMark.objects.filter(
                student__in=students, evaluation__assignment__phase__semester_subject__in=offerings
            ).values("student_id", "evaluation__assignment__phase_id", "marks", "evaluation__status")
        }

        subjects = []
        for offering in offerings:
            rows = phases.get(offering.id, [])
            subjects.append(
                {
                    "semester_subject": OfferingBriefSerializer(offering).data,
                    "phases": [
                        {
                            "id": p.id,
                            "name": p.name,
                            "order": p.order,
                            "max_marks": f"{p.max_marks:.2f}",
                            "status": p.effective_status(),
                            "is_project_phase": i == 0,
                        }
                        for i, p in enumerate(rows)
                    ],
                    "total_max_marks": f"{sum((p.max_marks for p in rows), 0):.2f}",
                }
            )

        def student_row(student):
            cells = {}
            for offering in offerings:
                team = memberships.get((student.id, offering.id))
                given = {}
                total = None
                for p in phases.get(offering.id, []):
                    m = marks.get((student.id, p.id))
                    if m is None:
                        continue
                    given[str(p.id)] = {"marks": f"{m['marks']:.2f}", "status": m["evaluation__status"]}
                    total = (total or 0) + m["marks"]
                cells[str(offering.id)] = {
                    "team": {"id": team[0], "display_name": team[1] or f"Team #{team[0]}"} if team else None,
                    "marks": given,
                    "total": f"{total:.2f}" if total is not None else None,
                }
            return {"student": {**StudentBriefSerializer(student).data, "status": student.user.status}, "subjects": cells}

        return Response(
            {
                "section": {"id": section.id, "name": section.name, "semester_number": section.semester.semester_number},
                "subjects": subjects,
                "students": [student_row(s) for s in students],
            }
        )
