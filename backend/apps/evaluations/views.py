"""Evaluations.

- Faculty (/my/evaluations/): teams I evaluate per phase, their submitted links,
  marks entry (phase CLOSED and not locked) and team naming.
- Admin (/evaluations/): every assignment with marks; corrections to existing marks
  while the phase is unlocked. The Admin never evaluates first-hand.
"""

import django_filters
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import Faculty
from apps.common import audit
from apps.common.choices import EvaluationStatus
from apps.common.permissions import IsCollegeAdmin, IsFaculty
from apps.common.tenancy import CollegeScopedMixin
from apps.teams import services as team_services

from . import services
from .models import EvaluatorAssignment
from .serializers import AssignmentSerializer, MarksSerializer, TeamNameSerializer, assignment_queryset, submissions_for


class AssignmentFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="phase__semester_subject__semester_id")
    semester_subject_id = django_filters.NumberFilter(field_name="phase__semester_subject_id")
    phase_id = django_filters.NumberFilter(field_name="phase_id")
    team_id = django_filters.NumberFilter(field_name="team_id")
    evaluator_id = django_filters.NumberFilter(field_name="evaluator_id")
    evaluator_pending = django_filters.BooleanFilter(field_name="evaluator", lookup_expr="isnull")
    evaluated = django_filters.BooleanFilter(method="filter_evaluated")

    class Meta:
        model = EvaluatorAssignment
        fields = ["semester_id", "semester_subject_id", "phase_id", "team_id", "evaluator_id"]

    def filter_evaluated(self, qs, name, value):
        cond = Q(evaluation__status=EvaluationStatus.SUBMITTED)
        return qs.filter(cond) if value else qs.exclude(cond)


class AssignmentListMixin:
    serializer_class = AssignmentSerializer
    filterset_class = AssignmentFilter
    search_fields = ["team__name", "team__members__student__user__name", "team__members__student__roll_number"]
    ordering_aliases = {"phase": "phase__order", "team": "team_id"}
    ordering = ["phase__semester_subject__subject__code", "phase__order", "phase__start_date", "team_id"]

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(queryset)
        rows = page if page is not None else list(queryset)
        context = {**self.get_serializer_context(), "submissions": submissions_for(rows)}
        data = AssignmentSerializer(rows, many=True, context=context).data
        return self.get_paginated_response(data) if page is not None else Response(data)

    def _one(self, assignment):
        assignment = assignment_queryset().get(pk=assignment.pk)
        context = {**self.get_serializer_context(), "submissions": submissions_for([assignment])}
        return Response(AssignmentSerializer(assignment, context=context).data)

    def retrieve(self, request, *args, **kwargs):
        return self._one(self.get_object())


def marks_audit(evaluation):
    return services.marks_snapshot(evaluation)


@extend_schema(tags=["faculty-portal"])
class MyEvaluationViewSet(AssignmentListMixin, CollegeScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsFaculty]

    @cached_property
    def faculty(self):
        return get_object_or_404(Faculty.objects.select_related("user"), user=self.request.user)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return EvaluatorAssignment.objects.none()
        return assignment_queryset().filter(evaluator=self.faculty).distinct()

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"], search_fields=[], ordering_aliases={}, filterset_class=None)
    def phases(self, request):
        """Phases where I evaluate at least one team, with progress counts (for the picker)."""
        rows = (
            EvaluatorAssignment.objects.filter(evaluator=self.faculty)
            .values(
                "phase_id", "phase__name", "phase__order", "phase__start_date", "phase__end_date",
                "phase__semester_subject_id", "phase__semester_subject__subject__code",
                "phase__semester_subject__subject__name", "phase__semester_subject__semester__semester_number",
            )
            .annotate(
                teams=Count("id"),
                evaluated=Count("id", filter=Q(evaluation__status=EvaluationStatus.SUBMITTED)),
            )
            .order_by("phase__semester_subject__semester__semester_number", "phase__semester_subject__subject__code", "phase__order")
        )
        from apps.projects.models import Phase

        phases = {p.id: p for p in Phase.objects.filter(pk__in=[r["phase_id"] for r in rows])}
        return Response(
            [
                {
                    "phase": {
                        "id": r["phase_id"],
                        "name": r["phase__name"],
                        "order": r["phase__order"],
                        "start_date": r["phase__start_date"],
                        "end_date": r["phase__end_date"],
                        "status": phases[r["phase_id"]].effective_status(),
                        "max_marks": phases[r["phase_id"]].max_marks,
                    },
                    "semester_subject": {
                        "id": r["phase__semester_subject_id"],
                        "semester_number": r["phase__semester_subject__semester__semester_number"],
                        "subject_code": r["phase__semester_subject__subject__code"],
                        "subject_name": r["phase__semester_subject__subject__name"],
                    },
                    "teams": r["teams"],
                    "evaluated": r["evaluated"],
                }
                for r in rows
            ]
        )

    @extend_schema(request=MarksSerializer, responses={200: AssignmentSerializer})
    @action(detail=True, methods=["put"])
    def marks(self, request, pk=None):
        assignment = self.get_object()
        serializer = MarksSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        evaluation, old = services.save_marks(
            assignment, default_marks=data.get("default_marks"), student_marks=data["student_marks"],
            remarks=data.get("remarks"), submit=data["submit"],
            by_user=request.user, as_faculty=self.faculty,
        )
        audit.record(request, "evaluation.marks", evaluation, old=old, new=marks_audit(evaluation))
        return self._one(assignment)

    @extend_schema(request=TeamNameSerializer, responses={200: AssignmentSerializer})
    @action(detail=True, methods=["post"], url_path="team-name")
    def team_name(self, request, pk=None):
        """Name (or rename) the team. Any evaluator of the team may do this."""
        assignment = self.get_object()
        serializer = TeamNameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        team = assignment.team
        old = {"name": team.name}
        team_services.rename(team, serializer.validated_data["name"], request.user)
        audit.record(request, "team.rename", team, old=old, new={"name": team.name})
        return self._one(assignment)


@extend_schema(tags=["evaluations"])
class EvaluationAdminViewSet(AssignmentListMixin, CollegeScopedMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """/evaluations/ — every team × phase with its evaluator, submission and marks."""

    permission_classes = [IsCollegeAdmin]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return EvaluatorAssignment.objects.none()
        return assignment_queryset().filter(phase__semester_subject__semester__college=self.college).distinct()

    @extend_schema(request=MarksSerializer, responses={200: AssignmentSerializer})
    @action(detail=True, methods=["put"])
    def marks(self, request, pk=None):
        """Correct marks the evaluator already entered (phase must be unlocked and past its end date)."""
        assignment = self.get_object()
        serializer = MarksSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        evaluation, old = services.save_marks(
            assignment, default_marks=data.get("default_marks"), student_marks=data["student_marks"],
            remarks=data.get("remarks"), submit=data["submit"],
            by_user=request.user, correction=True,
        )
        audit.record(request, "evaluation.correct", evaluation, old=old, new=marks_audit(evaluation))
        return self._one(assignment)
