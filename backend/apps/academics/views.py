"""Academic structure CRUD (docs/API.md §13–17) — College Admin / Super Admin."""

import django_filters
from django.db import transaction
from django.db.models import Count, Prefetch
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from apps.common import audit
from apps.common.bulk import BulkDeleteMixin
from apps.common.exceptions import Conflict
from apps.common.permissions import IsCollegeAdmin
from apps.common.tenancy import CollegeScopedMixin

from .models import Section, SectionSubject, Semester, SemesterSubject, Subject
from .serializers import (
    BulkMappingItemSerializer,
    BulkMappingSerializer,
    ClassTeacherSerializer,
    SectionSerializer,
    SectionSubjectSerializer,
    SemesterSerializer,
    SemesterSubjectSerializer,
    SubjectSerializer,
    ensure_class_teacher_free,
    validate_mapping,
)

SECTION_SUBJECTS_PREFETCH = Prefetch(
    "section_subjects",
    queryset=SectionSubject.objects.select_related("semester_subject__subject", "faculty__user", "section").order_by(
        "semester_subject__subject__code", "section__name"
    ),
)


class AcademicViewSet(BulkDeleteMixin, CollegeScopedMixin, viewsets.ModelViewSet):
    """CRUD with audit records. Subclasses set `entity` and `audit_fields`."""

    permission_classes = [IsCollegeAdmin]
    http_method_names = ["get", "post", "patch", "delete"]
    entity = ""
    audit_fields = ()

    def save_kwargs(self):
        return {}

    def refreshed(self, instance):
        return self.get_queryset().get(pk=instance.pk)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save(**self.save_kwargs())
        audit.record(request, f"{self.entity}.create", instance, new=audit.snapshot(instance, self.audit_fields))
        return Response(self.get_serializer(self.refreshed(instance)).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        old = audit.snapshot(instance, self.audit_fields)
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        audit.record(request, f"{self.entity}.update", instance, old=old, new=audit.snapshot(instance, self.audit_fields))
        return Response(self.get_serializer(self.refreshed(instance)).data)

    def perform_destroy(self, instance):
        audit.record(self.request, f"{self.entity}.delete", instance, old=audit.snapshot(instance, self.audit_fields))
        instance.delete()


# ---------------------------------------------------------------- semesters


@extend_schema(tags=["semesters"])
class SemesterViewSet(AcademicViewSet):
    serializer_class = SemesterSerializer
    entity = "semester"
    audit_fields = ("semester_number",)
    dependents_message = "{obj} still has students in its sections. Move or delete them first."
    ordering_aliases = {"semester_number": "semester_number"}
    ordering = ["semester_number"]

    def get_queryset(self):
        return Semester.objects.filter(college=self.college).annotate(
            sections_count=Count("sections", distinct=True),
            subjects_count=Count("semester_subjects", distinct=True),
            students_count=Count("sections__students", distinct=True),
        )

    def save_kwargs(self):
        return {"college": self.college}


# ---------------------------------------------------------------- subjects


class SubjectFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="semester_subjects__semester_id", distinct=True)

    class Meta:
        model = Subject
        fields = ["semester_id"]


@extend_schema(tags=["subjects"])
class SubjectViewSet(AcademicViewSet):
    serializer_class = SubjectSerializer
    filterset_class = SubjectFilter
    search_fields = ["code", "name"]
    entity = "subject"
    audit_fields = ("code", "name")
    ordering_aliases = {"code": "code", "name": "name", "created_at": "created_at"}
    ordering = ["code"]

    def get_queryset(self):
        return Subject.objects.filter(college=self.college).prefetch_related(
            Prefetch("semester_subjects", queryset=SemesterSubject.objects.select_related("semester"))
        )

    def save_kwargs(self):
        return {"college": self.college}


# ---------------------------------------------------------------- sections


class SectionFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="semester_id")
    has_class_teacher = django_filters.BooleanFilter(field_name="class_teacher", lookup_expr="isnull", exclude=True)

    class Meta:
        model = Section
        fields = ["semester_id", "has_class_teacher"]


@extend_schema(tags=["sections"])
class SectionViewSet(AcademicViewSet):
    serializer_class = SectionSerializer
    filterset_class = SectionFilter
    search_fields = ["name"]
    entity = "section"
    audit_fields = ("semester", "name", "class_teacher")
    dependents_message = "Section {obj.name} in {obj.semester} still has students. Move or delete them first."
    ordering_aliases = {"name": "name", "semester_number": "semester__semester_number"}
    ordering = ["semester__semester_number", "name"]
    # PUT is only for /sections/{id}/class-teacher/
    http_method_names = ["get", "post", "put", "patch", "delete"]

    def update(self, request, *args, **kwargs):
        if request.method == "PUT":
            raise MethodNotAllowed("PUT")
        return super().update(request, *args, **kwargs)

    def get_queryset(self):
        return (
            Section.objects.filter(semester__college=self.college)
            .select_related("semester", "class_teacher__user")
            .prefetch_related(SECTION_SUBJECTS_PREFETCH)
            .annotate(students_count=Count("students", distinct=True))
        )

    @extend_schema(methods=["PUT"], request=ClassTeacherSerializer, responses={200: SectionSerializer})
    @extend_schema(methods=["DELETE"], request=None, responses={200: SectionSerializer})
    @action(detail=True, methods=["put", "delete"], url_path="class-teacher")
    def class_teacher(self, request, pk=None):
        section = self.get_object()
        old = audit.snapshot(section, ["class_teacher"])
        if request.method == "PUT":
            serializer = ClassTeacherSerializer(data=request.data, context=self.get_serializer_context())
            serializer.is_valid(raise_exception=True)
            faculty = serializer.validated_data["faculty_id"]
            ensure_class_teacher_free(faculty, section.semester, exclude_section=section)
            section.class_teacher = faculty
            action_name = "section.class_teacher_assign"
        else:
            section.class_teacher = None
            action_name = "section.class_teacher_remove"
        section.save(update_fields=["class_teacher", "updated_at"])
        audit.record(request, action_name, section, old=old, new=audit.snapshot(section, ["class_teacher"]))
        return Response(self.get_serializer(self.refreshed(section)).data)


# ---------------------------------------------------------------- semester subjects


class SemesterSubjectFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="semester_id")
    subject_id = django_filters.NumberFilter(field_name="subject_id")

    class Meta:
        model = SemesterSubject
        fields = ["semester_id", "subject_id"]


@extend_schema(tags=["semester-subjects"])
class SemesterSubjectViewSet(
    BulkDeleteMixin,
    CollegeScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsCollegeAdmin]
    serializer_class = SemesterSubjectSerializer
    filterset_class = SemesterSubjectFilter
    # subject code/name, semester number, or a mapped section / its faculty
    search_fields = [
        "subject__code",
        "subject__name",
        "=semester__semester_number",
        "section_subjects__section__name",
        "section_subjects__faculty__user__name",
    ]
    ordering = ["semester__semester_number", "subject__code"]
    ordering_aliases = {}

    def get_queryset(self):
        return (
            SemesterSubject.objects.filter(semester__college=self.college)
            .select_related("semester", "subject")
            .prefetch_related(SECTION_SUBJECTS_PREFETCH)
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        offering = serializer.save()
        audit.record(request, "semester_subject.create", offering, new=audit.snapshot(offering, ["semester", "subject"]))
        offering = self.get_queryset().get(pk=offering.pk)
        return Response(self.get_serializer(offering).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        audit.record(self.request, "semester_subject.delete", instance, old=audit.snapshot(instance, ["semester", "subject"]))
        instance.delete()


# ---------------------------------------------------------------- section subjects


class SectionSubjectFilter(django_filters.FilterSet):
    semester_id = django_filters.NumberFilter(field_name="section__semester_id")
    section_id = django_filters.NumberFilter(field_name="section_id")
    semester_subject_id = django_filters.NumberFilter(field_name="semester_subject_id")
    subject_id = django_filters.NumberFilter(field_name="semester_subject__subject_id")
    faculty_id = django_filters.NumberFilter(field_name="faculty_id")
    unassigned = django_filters.BooleanFilter(field_name="faculty", lookup_expr="isnull")

    class Meta:
        model = SectionSubject
        fields = ["semester_id", "section_id", "semester_subject_id", "subject_id", "faculty_id", "unassigned"]


def _bulk_item_failure(item, code, message):
    return {"section_id": item.get("section_id") if isinstance(item, dict) else None, "code": code, "message": message}


@extend_schema(tags=["section-subjects"])
class SectionSubjectViewSet(AcademicViewSet):
    serializer_class = SectionSubjectSerializer
    filterset_class = SectionSubjectFilter
    entity = "section_subject"
    audit_fields = ("section", "semester_subject", "faculty")
    # subject, section, semester number or assigned faculty (name/email)
    search_fields = [
        "semester_subject__subject__code",
        "semester_subject__subject__name",
        "section__name",
        "=section__semester__semester_number",
        "faculty__user__name",
        "faculty__user__email",
    ]
    ordering = ["section__semester__semester_number", "semester_subject__subject__code", "section__name"]
    ordering_aliases = {}

    def get_queryset(self):
        return SectionSubject.objects.filter(section__semester__college=self.college).select_related(
            "section__semester", "semester_subject__subject", "faculty__user"
        )

    @extend_schema(request=BulkMappingSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    def bulk(self, request):
        context = self.get_serializer_context()
        serializer = BulkMappingSerializer(data=request.data, context=context)
        serializer.is_valid(raise_exception=True)
        offering = serializer.validated_data["semester_subject"]

        created, failed = [], []
        for item in serializer.validated_data["items"]:
            item_serializer = BulkMappingItemSerializer(data=item, context=context)
            if not item_serializer.is_valid():
                errors = item_serializer.errors
                field = next(iter(errors))
                failed.append(_bulk_item_failure(item, "VALIDATION_ERROR", f"{field}: {errors[field][0]}"))
                continue
            section = item_serializer.validated_data["section"]
            faculty = item_serializer.validated_data.get("faculty")
            try:
                with transaction.atomic():
                    validate_mapping(section, offering)
                    mapping = SectionSubject.objects.create(
                        section=section,
                        semester_subject=offering,
                        faculty=faculty,
                        faculty_assigned_at=timezone.now() if faculty else None,
                    )
            except Conflict as exc:
                failed.append(_bulk_item_failure(item, "CONFLICT", str(exc.detail)))
                continue
            except serializers.ValidationError as exc:
                detail = exc.detail
                message = next(iter(detail.values()))[0] if isinstance(detail, dict) else str(detail)
                failed.append(_bulk_item_failure(item, "VALIDATION_ERROR", str(message)))
                continue
            audit.record(request, "section_subject.create", mapping, new=audit.snapshot(mapping, self.audit_fields))
            created.append(mapping.pk)

        mappings = self.get_queryset().filter(pk__in=created)
        return Response({"created": self.get_serializer(mappings, many=True).data, "failed": failed})
