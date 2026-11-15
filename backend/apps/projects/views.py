"""College Admin: project phases per semester-subject (create, edit, reorder, lock/unlock, delete)."""

import django_filters
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.models import SemesterSubject
from apps.common import audit
from apps.common.bulk import BulkDeleteMixin
from apps.common.choices import EvaluationStatus, PhaseStatus, SubmissionStatus
from apps.common.exceptions import Conflict
from apps.common.permissions import IsCollegeAdmin
from apps.common.tenancy import CollegeScopedMixin
from apps.evaluations import services as evaluation_services

from . import services
from .models import Phase
from .serializers import PhaseSerializer, ReorderSerializer

AUDIT_FIELDS = (
    "semester_subject", "name", "start_date", "end_date", "evaluation_end_date", "max_marks", "order", "locked_at",
)


class PhaseFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="semester_subject__semester_id")
    semester_subject_id = django_filters.NumberFilter(field_name="semester_subject_id")
    subject_id = django_filters.NumberFilter(field_name="semester_subject__subject_id")
    status = django_filters.ChoiceFilter(choices=PhaseStatus.choices)

    class Meta:
        model = Phase
        fields = ["semester_id", "semester_subject_id", "subject_id", "status"]


@extend_schema(tags=["phases"])
class PhaseViewSet(BulkDeleteMixin, CollegeScopedMixin, viewsets.ModelViewSet):
    permission_classes = [IsCollegeAdmin]
    serializer_class = PhaseSerializer
    filterset_class = PhaseFilter
    http_method_names = ["get", "post", "patch", "delete"]
    search_fields = ["name", "semester_subject__subject__code", "semester_subject__subject__name"]
    ordering_aliases = {"start_date": "start_date", "order": "order", "name": "name"}
    ordering = ["semester_subject__semester__semester_number", "semester_subject__subject__code", "order", "start_date"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Phase.objects.none()
        return (
            Phase.objects.filter(semester_subject__semester__college=self.college)
            .select_related("semester_subject__semester", "semester_subject__subject", "locked_by")
            .annotate(
                teams_count=Count("evaluator_assignments", distinct=True),
                submitted_count=Count(
                    "submissions", filter=Q(submissions__status=SubmissionStatus.SUBMITTED), distinct=True
                ),
                evaluated_count=Count(
                    "evaluator_assignments",
                    filter=Q(evaluator_assignments__evaluation__status=EvaluationStatus.SUBMITTED),
                    distinct=True,
                ),
                evaluator_pending_count=Count(
                    "evaluator_assignments", filter=Q(evaluator_assignments__evaluator__isnull=True), distinct=True
                ),
            )
        )

    def _respond(self, phase, code=status.HTTP_200_OK):
        return Response(self.get_serializer(self.get_queryset().get(pk=phase.pk)).data, status=code)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        offering = data["semester_subject"]
        services.ensure_no_overlap(offering.id, data["start_date"], data["end_date"])
        phase = Phase(**data, order=services.next_order(offering.id), created_by=request.user)
        services.save_phase(phase)
        evaluation_services.sync_phase(phase)  # every existing team gets its evaluator for this phase
        audit.record(request, "phase.create", phase, new=audit.snapshot(phase, AUDIT_FIELDS))
        return self._respond(phase, status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        phase = self.get_object()
        if phase.locked_at:
            raise Conflict("This phase is locked. Unlock it to make changes.")
        serializer = self.get_serializer(phase, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        old = audit.snapshot(phase, AUDIT_FIELDS)
        for field, value in serializer.validated_data.items():
            setattr(phase, field, value)
        services.ensure_no_overlap(phase.semester_subject_id, phase.start_date, phase.end_date, exclude_id=phase.pk)
        services.save_phase(phase)
        audit.record(request, "phase.update", phase, old=old, new=audit.snapshot(phase, AUDIT_FIELDS))
        return self._respond(phase)

    def perform_destroy(self, instance):
        # cascades to its submissions, evaluator assignments and evaluations (PRD §10.2)
        audit.record(self.request, "phase.delete", instance, old=audit.snapshot(instance, AUDIT_FIELDS))
        instance.delete()

    @extend_schema(request=None, responses={200: PhaseSerializer})
    @action(detail=True, methods=["post"])
    def lock(self, request, pk=None):
        """Lock evaluation: no mark changes until unlocked."""
        phase = self.get_object()
        services.lock_phase(phase, request.user)
        audit.record(request, "phase.lock", phase, new={"locked_at": phase.locked_at})
        return self._respond(phase)

    @extend_schema(request=None, responses={200: PhaseSerializer})
    @action(detail=True, methods=["post"])
    def unlock(self, request, pk=None):
        """Unlock for corrections. It then stays unlocked until locked again by hand."""
        phase = self.get_object()
        old = {"locked_at": phase.locked_at}
        services.unlock_phase(phase, request.user)
        audit.record(request, "phase.unlock", phase, old=old)
        return self._respond(phase)

    @extend_schema(request=ReorderSerializer, responses={200: PhaseSerializer(many=True)})
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        offering = get_object_or_404(SemesterSubject, pk=data["semester_subject_id"], semester__college=self.college)
        services.reorder(offering.id, data["ids"])
        audit.record(request, "phase.reorder", offering, new={"ids": data["ids"]})
        phases = self.get_queryset().filter(semester_subject=offering).order_by("order", "start_date")
        return Response(self.get_serializer(phases, many=True).data)
