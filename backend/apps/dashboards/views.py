from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Faculty
from apps.common.permissions import IsCollegeAdmin, IsFaculty
from apps.common.tenancy import get_request_college

from . import services


@extend_schema(tags=["dashboards"], responses={200: dict})
class AdminDashboardView(APIView):
    """GET /dashboard/ — counts and pending setup work for the College Admin."""

    permission_classes = [IsCollegeAdmin]

    def get(self, request):
        return Response(services.admin_dashboard(get_request_college(request)))


@extend_schema(tags=["faculty-portal"], responses={200: dict})
class FacultyDashboardView(APIView):
    """GET /my/dashboard/ — the logged-in faculty member's class-teacher sections and teaching."""

    permission_classes = [IsFaculty]

    def get(self, request):
        faculty = get_object_or_404(Faculty.objects.select_related("user"), user=request.user)
        return Response(services.faculty_dashboard(faculty))
