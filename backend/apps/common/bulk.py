"""POST {list}/bulk-delete/ for any viewset with a `perform_destroy` (docs/API.md §5 BulkResult)."""

from django.db import transaction
from django.db.models import ProtectedError, RestrictedError
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.response import Response

from .exceptions import HasDependents, PMSError
from .serializers import BulkIdsSerializer


class BulkDeleteMixin:
    """Deletes each id in its own savepoint, so one blocked row never stops the rest."""

    dependents_message = "{obj} has dependent records and cannot be deleted."  # formatted with obj=

    @extend_schema(request=BulkIdsSerializer, responses={200: dict})
    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request, **kwargs):
        if "delete" not in self.http_method_names:  # e.g. class teachers can't delete students
            raise MethodNotAllowed("POST")
        serializer = BulkIdsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ids = list(dict.fromkeys(serializer.validated_data["ids"]))
        found = {obj.pk: obj for obj in self.get_queryset().filter(pk__in=ids)}

        succeeded, failed = [], []
        for pk in ids:
            obj = found.get(pk)
            if obj is None:
                failed.append({"id": pk, "code": "NOT_FOUND", "message": "Not found."})
                continue
            try:
                with transaction.atomic():
                    self.perform_destroy(obj)
                succeeded.append(pk)
            except (ProtectedError, RestrictedError):
                failed.append({"id": pk, "code": HasDependents.code, "message": self.dependents_message.format(obj=obj)})
            except PMSError as exc:
                failed.append({"id": pk, "code": exc.code, "message": str(exc.detail)})
        return Response({"succeeded": succeeded, "failed": failed})
