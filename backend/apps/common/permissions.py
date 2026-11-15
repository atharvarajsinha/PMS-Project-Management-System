from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

from .choices import Role
from .exceptions import PasswordChangeRequired

SUPER_ADMIN = Role.SUPER_ADMIN
ADMIN = Role.ADMIN
FACULTY = Role.FACULTY
STUDENT = Role.STUDENT


class IsActiveUser(BasePermission):
    """Default: logged in and not stuck on a temporary password.

    Views that must stay reachable with a temporary password set
    `allow_pending_password_change = True`.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user:
            return False
        if user.must_change_password and not getattr(view, "allow_pending_password_change", False):
            raise PasswordChangeRequired()
        return True


class HasRole(IsActiveUser):
    roles: tuple = ()

    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role in self.roles


class IsSuperAdmin(HasRole):
    roles = (SUPER_ADMIN,)


class IsCollegeAdmin(HasRole):
    """College Admin, or Super Admin acting on a college via X-College-Id."""

    roles = (SUPER_ADMIN, ADMIN)


class IsFaculty(HasRole):
    roles = (FACULTY,)


class IsStudent(HasRole):
    roles = (STUDENT,)


class ReadAnyWriteCollegeAdmin(IsActiveUser):
    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.method in SAFE_METHODS or request.user.role in IsCollegeAdmin.roles


class ApiDocsPermission(BasePermission):
    """Swagger/OpenAPI: public when API_DOCS_PUBLIC, else Super/College Admin only."""

    def has_permission(self, request, view):
        if settings.API_DOCS_PUBLIC:
            return True
        user = request.user
        return bool(user) and user.role in IsCollegeAdmin.roles
