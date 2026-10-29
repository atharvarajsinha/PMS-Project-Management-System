"""Faculty portal (`/my/...`): a faculty member's own class-teacher sections and teaching.

- Class teacher: view their sections and manage those sections' students
  (create, edit, activate/deactivate, resend credentials). Deleting students and
  moving them between sections stays with the College Admin.
- Teaching: read-only view of their section-subject assignments and the students in them.
"""

from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils.functional import cached_property
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action

from apps.accounts.models import Student
from apps.accounts.serializers import ClassStudentSerializer, StudentSerializer
from apps.accounts.views_people import StudentViewSet
from apps.common.permissions import IsFaculty
from apps.common.tenancy import CollegeScopedMixin

from .models import Section, SectionSubject
from .serializers import SectionSerializer, TeachingSerializer
from .views import SECTION_SUBJECTS_PREFETCH


@extend_schema(tags=["faculty-portal"])
class MyClassSectionViewSet(CollegeScopedMixin, viewsets.ReadOnlyModelViewSet):
    """GET /my/class-sections/ — sections where I am the class teacher."""

    permission_classes = [IsFaculty]
    serializer_class = SectionSerializer
    ordering = ["semester__semester_number", "name"]
    ordering_aliases = {}

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Section.objects.none()
        return (
            Section.objects.filter(class_teacher__user=self.request.user)
            .select_related("semester", "class_teacher__user")
            .prefetch_related(SECTION_SUBJECTS_PREFETCH)
            .annotate(students_count=Count("students", distinct=True))
        )


@extend_schema(tags=["faculty-portal"])
class MyClassStudentViewSet(StudentViewSet):
    """/my/class-sections/{section_pk}/students/ — the class teacher manages their students."""

    permission_classes = [IsFaculty]
    serializer_class = ClassStudentSerializer
    http_method_names = ["get", "post", "patch"]  # no delete for faculty

    @cached_property
    def section(self):
        return get_object_or_404(
            Section.objects.select_related("semester"),
            pk=self.kwargs["section_pk"],
            class_teacher__user=self.request.user,
        )

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Student.objects.none()
        return super().get_queryset().filter(section=self.section)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if not getattr(self, "swagger_fake_view", False):
            context["section"] = self.section
        return context


@extend_schema(tags=["faculty-portal"])
class MyTeachingViewSet(CollegeScopedMixin, viewsets.ReadOnlyModelViewSet):
    """GET /my/teaching/ — my section-subject assignments (read-only)."""

    permission_classes = [IsFaculty]
    serializer_class = TeachingSerializer
    search_fields = ["semester_subject__subject__code", "semester_subject__subject__name", "section__name"]
    ordering = ["section__semester__semester_number", "semester_subject__subject__code", "section__name"]
    ordering_aliases = {}

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return SectionSubject.objects.none()
        return (
            SectionSubject.objects.filter(faculty__user=self.request.user)
            .select_related("section__semester", "section__class_teacher__user", "semester_subject__subject")
            .annotate(students_count=Count("section__students", distinct=True))
        )

    @extend_schema(
        responses={200: StudentSerializer(many=True)},
        parameters=[OpenApiParameter("status", str, enum=["ACTIVE", "INACTIVE"])],
    )
    @action(
        detail=True,
        methods=["get"],
        search_fields=["user__name", "user__email", "roll_number"],
        ordering_aliases={"name": "user__name", "roll_number": "roll_number"},
        ordering=["roll_number"],
    )
    def students(self, request, pk=None):
        """Students of the section I teach this subject in (read-only, paginated)."""
        # not get_object(): this action's ordering/search settings are for students
        assignment = get_object_or_404(self.get_queryset(), pk=pk)
        queryset = Student.objects.filter(section=assignment.section).select_related("user", "section__semester")
        if request.query_params.get("status") in ("ACTIVE", "INACTIVE"):
            queryset = queryset.filter(user__status=request.query_params["status"])
        queryset = self.filter_queryset(queryset)
        page = self.paginate_queryset(queryset)
        return self.get_paginated_response(StudentSerializer(page, many=True).data)
