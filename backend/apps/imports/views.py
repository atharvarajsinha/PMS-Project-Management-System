"""Bulk CSV imports — College Admin / Super Admin (with X-College-Id)."""

from django.http import Http404, HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import InvalidInput
from apps.common.permissions import IsCollegeAdmin
from apps.common.tenancy import CollegeScopedMixin

from .importers import IMPORTERS


def get_importer_class(kind):
    try:
        return IMPORTERS[kind]
    except KeyError:
        raise Http404 from None


@extend_schema(tags=["imports"])
class ImportKindsView(APIView):
    """GET /imports/ — what can be imported, in dependency order, with each file's columns."""

    permission_classes = [IsCollegeAdmin]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"results": [cls.meta() for cls in IMPORTERS.values()]})


@extend_schema(tags=["imports"])
class ImportTemplateView(APIView):
    """GET /imports/{kind}/template/ — CSV with the header row and example rows."""

    permission_classes = [IsCollegeAdmin]

    @extend_schema(responses={(200, "text/csv"): str})
    def get(self, request, kind):
        cls = get_importer_class(kind)
        response = HttpResponse(cls.template_csv(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="pms-{kind}-template.csv"'
        return response


@extend_schema(tags=["imports"])
class ImportRunView(CollegeScopedMixin, APIView):
    """POST /imports/{kind}/ (multipart `file`) — `dry_run=true` validates only and saves nothing."""

    permission_classes = [IsCollegeAdmin]
    parser_classes = [MultiPartParser]

    @extend_schema(
        request={"multipart/form-data": {"type": "object", "properties": {"file": {"type": "string", "format": "binary"}}}},
        parameters=[OpenApiParameter("dry_run", bool, description="Validate and preview without saving")],
        responses={200: dict},
    )
    def post(self, request, kind):
        cls = get_importer_class(kind)
        upload = request.FILES.get("file")
        if upload is None:
            raise InvalidInput("Choose a CSV file to upload.", {"file": ["Choose a CSV file to upload."]})
        dry_run = str(request.query_params.get("dry_run", "")).lower() in ("1", "true", "yes")
        return Response(cls(request, self.college).run(upload, dry_run=dry_run))
