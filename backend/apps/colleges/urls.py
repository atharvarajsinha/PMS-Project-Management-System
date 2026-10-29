from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    CollegeAdminActionView,
    CollegeAdminView,
    CollegeSettingsView,
    CurrentCollegeView,
    PlatformCollegeViewSet,
)

router = SimpleRouter()
router.register("platform/colleges", PlatformCollegeViewSet, basename="platform-colleges")

admin_base = "platform/colleges/<int:college_id>/admin/"

urlpatterns = [
    *router.urls,
    path(admin_base, CollegeAdminView.as_view(), name="college-admin"),
    *[
        path(f"{admin_base}{name}/", CollegeAdminActionView.as_view(action_name=name), name=f"college-admin-{name}")
        for name in ("activate", "deactivate", "resend-credentials")
    ],
    path("college/", CurrentCollegeView.as_view(), name="college"),
    path("settings/", CollegeSettingsView.as_view(), name="college-settings"),
]
