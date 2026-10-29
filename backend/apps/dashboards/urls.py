from django.urls import path

from .views import AdminDashboardView, FacultyDashboardView

urlpatterns = [
    path("dashboard/", AdminDashboardView.as_view(), name="admin-dashboard"),
    path("my/dashboard/", FacultyDashboardView.as_view(), name="faculty-dashboard"),
]
