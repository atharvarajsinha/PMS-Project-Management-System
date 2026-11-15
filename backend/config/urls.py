from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.common.permissions import ApiDocsPermission

api_v1 = [
    path("", include("apps.common.urls")),
    path("", include("apps.accounts.urls")),
    path("", include("apps.colleges.urls")),
    path("", include("apps.academics.urls")),
    path("", include("apps.dashboards.urls")),
    path("", include("apps.imports.urls")),
    path("", include("apps.projects.urls")),
    path("", include("apps.teams.urls")),
    path("", include("apps.evaluations.urls")),
]

urlpatterns = [
    path("api/v1/", include(api_v1)),
    path(
        "api/schema/",
        SpectacularAPIView.as_view(permission_classes=[ApiDocsPermission]),
        name="schema",
    ),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema", permission_classes=[ApiDocsPermission]),
        name="swagger",
    ),
]

handler404 = "apps.common.views.not_found"
handler500 = "apps.common.views.server_error"
