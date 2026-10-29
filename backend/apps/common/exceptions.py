"""Uniform error body: {"error": {"code", "message", "details"?}} — see docs/API.md §3."""

import logging

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.db import IntegrityError
from django.db.models import ProtectedError, RestrictedError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response

logger = logging.getLogger(__name__)


class PMSError(exceptions.APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "ERROR"
    default_detail = "Request failed."

    def __init__(self, message=None, details=None):
        super().__init__(message or self.default_detail)
        self.details = details


class InvalidInput(PMSError):
    """Same body as a serializer ValidationError; for hand-built field errors."""

    code = "VALIDATION_ERROR"
    default_detail = "Some fields are invalid."


class Conflict(PMSError):
    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"
    default_detail = "This conflicts with existing data."


class HasDependents(PMSError):
    status_code = status.HTTP_409_CONFLICT
    code = "HAS_DEPENDENTS"
    default_detail = "This record has dependent records and cannot be deleted."


class CollegeContextRequired(PMSError):
    code = "COLLEGE_CONTEXT_REQUIRED"
    default_detail = "Select a college (X-College-Id header) to perform this action."


class InvalidCredentials(PMSError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "INVALID_CREDENTIALS"
    default_detail = "Invalid email or password."


class TokenExpired(PMSError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "TOKEN_EXPIRED"
    default_detail = "Session expired."


class RefreshInvalid(PMSError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "REFRESH_INVALID"
    default_detail = "Your session has ended. Please log in again."


class AccountInactive(PMSError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "ACCOUNT_INACTIVE"
    default_detail = "Your account is inactive. Contact your administrator."


class CollegeInactive(PMSError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "COLLEGE_INACTIVE"
    default_detail = "Your college's access is currently disabled."


class PasswordChangeRequired(PMSError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "PASSWORD_CHANGE_REQUIRED"
    default_detail = "Please change your temporary password to continue."


class CSRFFailed(PMSError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "CSRF_FAILED"
    default_detail = "CSRF verification failed. Refresh the page and try again."


def error_response(exc_class, message=None, details=None):
    """Return an error Response *without* raising, so the request transaction still commits
    (e.g. to persist a failed-OTP attempt counter)."""
    return _error(exc_class.status_code, exc_class.code, message or exc_class.default_detail, details)


def _error(status_code, code, message, details=None, headers=None):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return Response(body, status=status_code, headers=headers)


def _validation_details(detail):
    if isinstance(detail, dict):
        return detail
    if isinstance(detail, list):
        return {"non_field_errors": detail}
    return {"non_field_errors": [detail]}


def api_exception_handler(exc, context):
    # imported here: rest_framework.views imports the authentication classes, which import this module
    from rest_framework.views import exception_handler as drf_exception_handler
    from rest_framework.views import set_rollback

    # ATOMIC_REQUESTS: never commit a request that ended in an error
    set_rollback()

    if isinstance(exc, PMSError):
        return _error(exc.status_code, exc.code, str(exc.detail), exc.details)

    if isinstance(exc, exceptions.ValidationError):
        return _error(400, "VALIDATION_ERROR", "Some fields are invalid.", _validation_details(exc.detail))

    if isinstance(exc, (ProtectedError, RestrictedError)):
        return _error(409, HasDependents.code, HasDependents.default_detail)

    if isinstance(exc, IntegrityError):
        logger.warning("IntegrityError surfaced as 409: %s", exc)
        return _error(409, Conflict.code, Conflict.default_detail)

    if isinstance(exc, (Http404, exceptions.NotFound)):
        return _error(404, "NOT_FOUND", "Not found.")

    if isinstance(exc, exceptions.Throttled):
        headers = {"Retry-After": str(int(exc.wait))} if exc.wait else None
        return _error(429, "RATE_LIMITED", "Too many attempts. Please try again later.", headers=headers)

    if isinstance(exc, (exceptions.NotAuthenticated, exceptions.AuthenticationFailed)):
        return _error(401, "NOT_AUTHENTICATED", "Please log in.")

    if isinstance(exc, (exceptions.PermissionDenied, DjangoPermissionDenied)):
        if str(getattr(exc, "detail", "")).startswith("CSRF Failed"):
            return _error(403, CSRFFailed.code, CSRFFailed.default_detail)
        return _error(403, "PERMISSION_DENIED", "You do not have permission to perform this action.")

    response = drf_exception_handler(exc, context)
    if response is not None:  # MethodNotAllowed, ParseError, UnsupportedMediaType, ...
        code = getattr(exc, "default_code", "error").upper()
        return _error(response.status_code, code, str(getattr(exc, "detail", "Request failed.")))

    logger.exception("Unhandled API error", exc_info=exc)
    return _error(500, "SERVER_ERROR", "Something went wrong. Please try again.")
