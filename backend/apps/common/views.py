import hmac

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import choices
from .emails import process_outbox


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict}, tags=["system"])
    def get(self, request):
        return Response({"status": "ok", "time": timezone.now()})


class JobsRunView(APIView):
    """Called by UptimeRobot every ~5 minutes: GET /jobs/run/?token=<JOBS_SECRET>."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(exclude=True)
    def get(self, request):
        token = request.query_params.get("token", "")
        if not settings.JOBS_SECRET or not hmac.compare_digest(token, settings.JOBS_SECRET):
            return JsonResponse({"error": {"code": "NOT_FOUND", "message": "Not found."}}, status=404)
        from apps.projects.services import sync_statuses

        return Response({**process_outbox(), **sync_statuses()})


class ChoicesView(APIView):
    """GET /meta/choices/ — every status/type list (same data as frontend/src/config/choices.generated.js)."""

    @extend_schema(responses={200: dict}, tags=["system"])
    def get(self, request):
        return Response(choices.as_dict())


def not_found(request, exception=None):
    return JsonResponse({"error": {"code": "NOT_FOUND", "message": "Not found."}}, status=404)


def server_error(request):
    return JsonResponse(
        {"error": {"code": "SERVER_ERROR", "message": "Something went wrong. Please try again."}}, status=500
    )
