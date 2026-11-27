from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views_auth
from .views_people import FacultyViewSet, MyFacultyProfileView, SpecializationViewSet, StudentViewSet

router = SimpleRouter()
router.register("faculty", FacultyViewSet, basename="faculty")
router.register("students", StudentViewSet, basename="students")
router.register("specializations", SpecializationViewSet, basename="specializations")

urlpatterns = [
    path("auth/csrf/", views_auth.CsrfView.as_view(), name="auth-csrf"),
    path("auth/login/", views_auth.LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", views_auth.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", views_auth.LogoutView.as_view(), name="auth-logout"),
    path("auth/change-password/", views_auth.ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/password-reset/request/", views_auth.PasswordResetRequestView.as_view(), name="auth-reset-request"),
    path("auth/password-reset/verify/", views_auth.PasswordResetVerifyView.as_view(), name="auth-reset-verify"),
    path("auth/password-reset/confirm/", views_auth.PasswordResetConfirmView.as_view(), name="auth-reset-confirm"),
    path("me/", views_auth.MeView.as_view(), name="me"),
    path("me/faculty-profile/", MyFacultyProfileView.as_view(), name="me-faculty-profile"),
    *router.urls,
]
