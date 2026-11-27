"""Faculty (docs/API.md §11) and Students (§12) — College Admin / Super Admin."""

import django_filters
from django.db.models import Count, Prefetch
from drf_spectacular.utils import extend_schema
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.academics.models import Section
from apps.common import audit
from apps.common.bulk import BulkDeleteMixin
from apps.common.exceptions import HasDependents
from apps.common.permissions import IsCollegeAdmin, IsFaculty, ReadAnyWriteCollegeAdmin
from apps.common.serializers import BulkIdsSerializer
from apps.common.tenancy import CollegeScopedMixin

from . import services
from .models import Faculty, Specialization, Student, User
from .serializers import (
    FacultyDetailSerializer,
    FacultyProfileSerializer,
    FacultySerializer,
    SpecializationSerializer,
    StudentBulkSerializer,
    StudentSerializer,
)

PERSON_AUDIT_FIELDS = ["name", "email", "phone", "status"]


def person_snapshot(profile, extra=()):
    data = audit.snapshot(profile.user, PERSON_AUDIT_FIELDS)
    data.update(audit.snapshot(profile, extra))
    return data


class PersonViewSet(BulkDeleteMixin, CollegeScopedMixin, viewsets.ModelViewSet):
    """Shared CRUD + account actions for Faculty and Student profiles."""

    permission_classes = [IsCollegeAdmin]
    http_method_names = ["get", "post", "patch", "delete"]
    entity = ""  # "faculty" / "student" for audit action names
    audit_extra_fields = ()

    def perform_create(self, serializer):
        profile = serializer.save()
        audit.record(self.request, f"{self.entity}.create", profile, new=person_snapshot(profile, self.audit_extra_fields))

    def perform_update(self, serializer):
        old = person_snapshot(serializer.instance, self.audit_extra_fields)
        profile = serializer.save()
        audit.record(
            self.request, f"{self.entity}.update", profile, old=old, new=person_snapshot(profile, self.audit_extra_fields)
        )

    def perform_destroy(self, instance):
        audit.record(self.request, f"{self.entity}.delete", instance, old=person_snapshot(instance, self.audit_extra_fields))
        instance.user.delete()  # cascades to the profile

    def _respond(self, profile):
        profile = self.get_queryset().get(pk=profile.pk)
        return Response(self.get_serializer(profile).data)

    def _status_action(self, fn, name):
        profile = self.get_object()
        fn(profile.user)
        audit.record(self.request, f"{self.entity}.{name}", profile)
        return self._respond(profile)

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None, **kwargs):
        return self._status_action(services.activate, "activate")

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None, **kwargs):
        return self._status_action(services.deactivate, "deactivate")

    @extend_schema(request=None, responses={202: None})
    @action(detail=True, methods=["post"], url_path="resend-credentials")
    def resend_credentials(self, request, pk=None, **kwargs):
        profile = self.get_object()
        services.resend_credentials(profile.user)
        audit.record(request, f"{self.entity}.resend_credentials", profile)
        return Response(status=status.HTTP_202_ACCEPTED)

    # bulk ------------------------------------------------------------------
    bulk_serializer_class = BulkIdsSerializer

    def bulk_targets(self, data):
        ids = data["ids"]
        return self.get_queryset().filter(pk__in=ids).select_related("user__college"), ids

    def _bulk(self, request, action_name):
        serializer = self.bulk_serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        profiles, requested = self.bulk_targets(serializer.validated_data)
        result = services.bulk_status_change(profiles, requested, action_name)
        audit.record(
            request,
            f"{self.entity}.bulk_{action_name}",
            entity_type=self.queryset_model._meta.label,
            new={"succeeded": result["succeeded"], "failed": [f["id"] for f in result["failed"]]},
        )
        return Response(result)

    @action(detail=False, methods=["post"], url_path="bulk-activate")
    def bulk_activate(self, request, **kwargs):
        return self._bulk(request, "activate")

    @action(detail=False, methods=["post"], url_path="bulk-deactivate")
    def bulk_deactivate(self, request, **kwargs):
        return self._bulk(request, "deactivate")


# ---------------------------------------------------------------- faculty


class FacultyFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(field_name="user__status", choices=User.Status.choices)
    specialization_id = django_filters.NumberFilter(field_name="specializations", distinct=True)

    class Meta:
        model = Faculty
        fields = ["status", "specialization_id"]


@extend_schema(tags=["faculty"])
class FacultyViewSet(PersonViewSet):
    entity = "faculty"
    queryset_model = Faculty
    filterset_class = FacultyFilter
    search_fields = ["user__name", "user__email"]
    ordering_aliases = {"name": "user__name", "created_at": "created_at", "last_login_at": "user__last_login_at"}
    ordering = ["user__name"]

    def get_queryset(self):
        return (
            Faculty.objects.filter(college=self.college)
            .select_related("user")
            .prefetch_related(
                Prefetch("class_teacher_sections", queryset=Section.objects.select_related("semester")),
                "specializations",
            )
            .annotate(
                teaching_count=Count("section_subjects", distinct=True),
                evaluation_teams_count=Count("evaluator_assignments__team", distinct=True),
            )
        )

    def get_serializer_class(self):
        return FacultyDetailSerializer if self.action == "retrieve" else FacultySerializer


# ---------------------------------------------------------------- specializations


@extend_schema(tags=["faculty"])
class SpecializationViewSet(BulkDeleteMixin, CollegeScopedMixin, viewsets.ModelViewSet):
    """The college's list of faculty specializations (AI/ML, Cyber Security, ...).
    Everyone in the college can read it (faculty pick from it); only the admin changes it."""

    permission_classes = [ReadAnyWriteCollegeAdmin]
    serializer_class = SpecializationSerializer
    http_method_names = ["get", "post", "patch", "delete"]
    search_fields = ["name"]
    ordering_aliases = {"name": "name", "faculty_count": "faculty_count", "created_at": "created_at"}
    ordering = ["name"]

    def get_queryset(self):
        return Specialization.objects.filter(college=self.college).annotate(faculty_count=Count("faculty", distinct=True))

    def perform_create(self, serializer):
        obj = serializer.save(college=self.college)
        audit.record(self.request, "specialization.create", obj, new={"name": obj.name})

    def perform_update(self, serializer):
        old = {"name": serializer.instance.name}
        obj = serializer.save()
        audit.record(self.request, "specialization.update", obj, old=old, new={"name": obj.name})

    def perform_destroy(self, instance):
        audit.record(self.request, "specialization.delete", instance, old={"name": instance.name})
        instance.delete()  # removes it from every faculty profile too


@extend_schema(tags=["faculty-portal"])
class MyFacultyProfileView(CollegeScopedMixin, generics.RetrieveUpdateAPIView):
    """GET/PATCH /me/faculty-profile/ — a faculty member's own specializations, research, papers, certifications."""

    permission_classes = [IsFaculty]
    serializer_class = FacultyProfileSerializer
    http_method_names = ["get", "patch"]

    def get_object(self):
        return get_object_or_404(Faculty.objects.prefetch_related("specializations"), user=self.request.user)

    def perform_update(self, serializer):
        faculty = serializer.save()
        audit.record(self.request, "faculty.profile_update", faculty)


# ---------------------------------------------------------------- students


class StudentFilter(django_filters.FilterSet):
    status = django_filters.ChoiceFilter(field_name="user__status", choices=User.Status.choices)
    semester_id = django_filters.NumberFilter(field_name="section__semester_id")
    section_id = django_filters.NumberFilter(field_name="section_id")

    class Meta:
        model = Student
        fields = ["status", "semester_id", "section_id"]


@extend_schema(tags=["students"])
class StudentViewSet(PersonViewSet):
    entity = "student"
    queryset_model = Student
    audit_extra_fields = ("roll_number", "section")
    serializer_class = StudentSerializer
    filterset_class = StudentFilter
    search_fields = ["user__name", "user__email", "roll_number"]
    ordering_aliases = {"name": "user__name", "roll_number": "roll_number", "created_at": "created_at"}
    ordering = ["roll_number"]
    bulk_serializer_class = StudentBulkSerializer
    dependents_message = "{obj.user.name} leads a team. Make another member the Team Lead first."

    def get_queryset(self):
        return Student.objects.filter(college=self.college).select_related("user", "section__semester")

    def perform_destroy(self, instance):
        # Team.lead is RESTRICT in the database too; this gives the clear message
        if instance.led_teams.exists():
            raise HasDependents(self.dependents_message.format(obj=instance))
        super().perform_destroy(instance)

    def bulk_targets(self, data):
        qs = self.get_queryset().select_related("user__college")
        if "ids" in data:
            return qs.filter(pk__in=data["ids"]), data["ids"]
        if "section_id" in data:
            return qs.filter(section_id=data["section_id"]), None
        return qs.filter(section__semester_id=data["semester_id"]), None

    @extend_schema(request=StudentBulkSerializer)
    @action(detail=False, methods=["post"], url_path="bulk-activate")
    def bulk_activate(self, request, **kwargs):
        return self._bulk(request, "activate")

    @extend_schema(request=StudentBulkSerializer)
    @action(detail=False, methods=["post"], url_path="bulk-deactivate")
    def bulk_deactivate(self, request, **kwargs):
        return self._bulk(request, "deactivate")
