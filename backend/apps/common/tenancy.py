"""Resolve which college a request operates on (docs/API.md §1, "College context")."""

from rest_framework.exceptions import NotFound

from .exceptions import CollegeContextRequired
from .permissions import SUPER_ADMIN

COLLEGE_HEADER = "X-College-Id"


def get_request_college(request):
    if hasattr(request, "_pms_college"):
        return request._pms_college

    user = request.user
    if user.role == SUPER_ADMIN:
        from apps.colleges.models import College

        raw = request.headers.get(COLLEGE_HEADER)
        if not raw:
            raise CollegeContextRequired()
        try:
            college = College.objects.get(id=int(raw))
        except (ValueError, College.DoesNotExist):
            raise NotFound()
    else:
        college = user.college

    request._pms_college = college
    return college


class CollegeScopedMixin:
    """For views whose data belongs to one college."""

    @property
    def college(self):
        if getattr(self, "swagger_fake_view", False):  # OpenAPI generation: no real request
            return None
        return get_request_college(self.request)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request is not None and self.request.user:
            context["college"] = self.college
        return context
