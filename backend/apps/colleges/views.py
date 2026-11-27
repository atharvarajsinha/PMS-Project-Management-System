"""Super Admin college management (docs/API.md §9) and college/settings (§10)."""

from django.db.models import Count, OuterRef, Prefetch, Subquery, Value
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.generics import GenericAPIView
from rest_framework.views import APIView

from apps.accounts import services as account_services
from apps.accounts.models import Faculty, Student, User
from apps.academics.models import Semester
from apps.common import audit
from apps.common.exceptions import Conflict, InvalidInput
from apps.common.permissions import IsCollegeAdmin, IsSuperAdmin, ReadAnyWriteCollegeAdmin
from apps.common.tenancy import get_request_college
from apps.dashboards.services import college_stats

from .models import College, CollegeSettings
from .serializers import (
    CollegeAdminSerializer,
    CollegeSerializer,
    CollegeSettingsSerializer,
    PlatformCollegeSerializer,
    PublicCollegeSerializer,
)

COLLEGE_AUDIT_FIELDS = ["name", "code", "status", "contact_email", "contact_phone", "address"]
SETTINGS_AUDIT_FIELDS = [
    "min_team_size", "max_team_size", "default_mentor_capacity", "team_formation_enabled",
    "teams_locked",
]
ADMIN_AUDIT_FIELDS = ["name", "email", "phone", "status"]


def _count(model, **filters):
    """Correlated COUNT subquery (avoids multiplying joins when several counts are annotated)."""
    sub = (
        model.objects.filter(college=OuterRef("pk"), **filters)
        .order_by()
        .values("college")
        .annotate(n=Count("pk"))
        .values("n")
    )
    return Coalesce(Subquery(sub), Value(0))


# ---------------------------------------------------------------- /platform/colleges/


@extend_schema(tags=["platform"])
class PlatformCollegeViewSet(viewsets.ModelViewSet):
    permission_classes = [IsSuperAdmin]
    serializer_class = PlatformCollegeSerializer
    http_method_names = ["get", "post", "patch", "delete"]
    filterset_fields = ["status"]
    search_fields = ["name", "code"]
    ordering_aliases = {"name": "name", "created_at": "created_at"}
    ordering = ["name"]

    def get_queryset(self):
        return College.objects.annotate(
            faculty_count=_count(Faculty),
            student_count=_count(Student),
            semester_count=_count(Semester),
        ).prefetch_related(Prefetch("users", queryset=User.objects.filter(role=User.Role.ADMIN), to_attr="admins"))

    def _fresh(self, college):
        return self.get_serializer(self.get_queryset().get(pk=college.pk)).data

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        college = serializer.save()
        audit.record(request, "college.create", college, college=college, new=audit.snapshot(college, COLLEGE_AUDIT_FIELDS))
        return Response(self._fresh(college), status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        college = self.get_object()
        old = audit.snapshot(college, COLLEGE_AUDIT_FIELDS)
        serializer = self.get_serializer(college, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit.record(request, "college.update", college, college=college, old=old, new=audit.snapshot(college, COLLEGE_AUDIT_FIELDS))
        return Response(self._fresh(college))

    @extend_schema(parameters=[OpenApiParameter("confirm", str, required=True, description="Must equal the college code")])
    def destroy(self, request, *args, **kwargs):
        college = self.get_object()
        if request.query_params.get("confirm", "").strip().upper() != college.code:
            raise InvalidInput(
                "Type the college code to confirm deletion.",
                {"confirm": ["Must match the college code."]},
            )
        # logged without a college link: the college's own logs are deleted with it
        audit.record(request, "college.delete", college, college=None, old=audit.snapshot(college, COLLEGE_AUDIT_FIELDS))
        college.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _set_status(self, request, new_status, action_name):
        college = self.get_object()
        if college.status == new_status:
            raise Conflict(f"College is already {new_status.lower()}.")
        college.status = new_status
        college.save(update_fields=["status", "updated_at"])
        if new_status == College.Status.INACTIVE:
            account_services.revoke_college_sessions(college)
        audit.record(request, f"college.{action_name}", college, college=college)
        return Response(self._fresh(college))

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        return self._set_status(request, College.Status.ACTIVE, "activate")

    @extend_schema(request=None)
    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        return self._set_status(request, College.Status.INACTIVE, "deactivate")


# ---------------------------------------------------------------- /platform/colleges/{id}/admin/


class CollegeAdminMixin:
    permission_classes = [IsSuperAdmin]
    serializer_class = CollegeAdminSerializer

    def get_college(self, college_id):
        return get_object_or_404(College, pk=college_id)

    def get_admin(self, college):
        return get_object_or_404(User, college=college, role=User.Role.ADMIN)


@extend_schema(tags=["platform"])
class CollegeAdminView(CollegeAdminMixin, GenericAPIView):
    @extend_schema(responses={200: CollegeAdminSerializer})
    def get(self, request, college_id):
        return Response(CollegeAdminSerializer(self.get_admin(self.get_college(college_id))).data)

    @extend_schema(request=CollegeAdminSerializer, responses={201: CollegeAdminSerializer})
    def post(self, request, college_id):
        college = self.get_college(college_id)
        serializer = CollegeAdminSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if User.objects.filter(college=college, role=User.Role.ADMIN).exists():
            raise Conflict("This college already has an admin. Delete it first to create a new one.")
        data = serializer.validated_data
        admin = account_services.create_account(
            college=college, role=User.Role.ADMIN, name=data["name"], email=data["email"], phone=data.get("phone", "")
        )
        audit.record(request, "college_admin.create", admin, college=college, new=audit.snapshot(admin, ADMIN_AUDIT_FIELDS))
        return Response(CollegeAdminSerializer(admin).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=CollegeAdminSerializer, responses={200: CollegeAdminSerializer})
    def patch(self, request, college_id):
        college = self.get_college(college_id)
        admin = self.get_admin(college)
        old = audit.snapshot(admin, ADMIN_AUDIT_FIELDS)
        serializer = CollegeAdminSerializer(admin, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit.record(request, "college_admin.update", admin, college=college, old=old, new=audit.snapshot(admin, ADMIN_AUDIT_FIELDS))
        return Response(CollegeAdminSerializer(admin).data)

    def delete(self, request, college_id):
        college = self.get_college(college_id)
        admin = self.get_admin(college)
        audit.record(request, "college_admin.delete", admin, college=college, old=audit.snapshot(admin, ADMIN_AUDIT_FIELDS))
        admin.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=["platform"], request=None, responses={200: CollegeAdminSerializer})
class CollegeAdminActionView(CollegeAdminMixin, GenericAPIView):
    """POST .../admin/activate|deactivate|resend-credentials/"""

    action_name = ""

    def post(self, request, college_id):
        college = self.get_college(college_id)
        admin = self.get_admin(college)
        if self.action_name == "activate":
            account_services.activate(admin)
        elif self.action_name == "deactivate":
            account_services.deactivate(admin)
        else:
            account_services.resend_credentials(admin)
        audit.record(request, f"college_admin.{self.action_name.replace('-', '_')}", admin, college=college)
        if self.action_name == "resend-credentials":
            return Response(status=status.HTTP_202_ACCEPTED)
        return Response(CollegeAdminSerializer(admin).data)


# ---------------------------------------------------------------- /college/ and /settings/


@extend_schema(tags=["college"])
class CurrentCollegeView(APIView):
    @extend_schema(responses={200: CollegeSerializer})
    def get(self, request):
        college = get_request_college(request)
        if request.user.role in IsCollegeAdmin.roles:
            return Response({**CollegeSerializer(college).data, "stats": college_stats(college)})
        return Response(PublicCollegeSerializer(college).data)


@extend_schema(tags=["college"])
class CollegeSettingsView(APIView):
    permission_classes = [ReadAnyWriteCollegeAdmin]

    def get_settings(self, request):
        college = get_request_college(request)
        settings_obj, _ = CollegeSettings.objects.select_related("updated_by").get_or_create(college=college)
        return settings_obj

    @extend_schema(responses={200: CollegeSettingsSerializer})
    def get(self, request):
        return Response(CollegeSettingsSerializer(self.get_settings(request)).data)

    @extend_schema(request=CollegeSettingsSerializer, responses={200: CollegeSettingsSerializer})
    def patch(self, request):
        settings_obj = self.get_settings(request)
        old = audit.snapshot(settings_obj, SETTINGS_AUDIT_FIELDS)
        serializer = CollegeSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)

        # One switch: opening team formation unlocks the teams; closing it locks them all
        # (no joins, leaves or changes, and evaluators stop following Team Lead changes).
        extra = {"updated_by": request.user}
        open_ = serializer.validated_data.get("team_formation_enabled")
        if open_ is True:
            extra.update(teams_locked=False, teams_locked_at=None)
        elif open_ is False and settings_obj.team_formation_enabled:
            extra.update(teams_locked=True, teams_locked_at=timezone.now())
        serializer.save(**extra)

        audit.record(request, "settings.update", settings_obj, old=old, new=audit.snapshot(settings_obj, SETTINGS_AUDIT_FIELDS))
        return Response(CollegeSettingsSerializer(settings_obj).data)
