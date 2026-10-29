"""JWT-in-httpOnly-cookie authentication with CSRF enforcement (docs/API.md §2)."""

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, CSRFCheck
from rest_framework_simplejwt.exceptions import ExpiredTokenError, TokenError
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from .exceptions import AccountInactive, CollegeInactive, CSRFFailed, TokenExpired

SAFE_METHODS = ("GET", "HEAD", "OPTIONS")


def user_can_authenticate(user):
    """simplejwt USER_AUTHENTICATION_RULE: used when refreshing tokens."""
    return user is not None and user.is_active and user.college_is_active


def check_user_access(user):
    if not user.is_active:
        raise AccountInactive()
    if not user.college_is_active:
        raise CollegeInactive()


def enforce_csrf(request):
    """Same check DRF's SessionAuthentication uses, but with our error code."""
    django_request = getattr(request, "_request", request)
    check = CSRFCheck(lambda req: None)
    check.process_request(django_request)
    reason = check.process_view(django_request, None, (), {})
    if reason:
        raise CSRFFailed()


class CookieJWTAuthentication(BaseAuthentication):
    def authenticate(self, request):
        raw = request.COOKIES.get(settings.AUTH_ACCESS_COOKIE)
        if not raw:
            return None
        try:
            token = AccessToken(raw)
        except ExpiredTokenError:
            raise TokenExpired()
        except TokenError:
            raise exceptions.AuthenticationFailed()

        User = get_user_model()
        try:
            user = User.objects.select_related("college").get(id=token["user_id"])
        except (User.DoesNotExist, KeyError, ValueError):
            raise exceptions.AuthenticationFailed()

        check_user_access(user)
        if request.method not in SAFE_METHODS:
            enforce_csrf(request)
        return user, token

    def authenticate_header(self, request):
        return 'Cookie realm="api"'


# ---------------------------------------------------------------- cookie helpers

def _cookie_kwargs():
    return {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }


def issue_session(response, user):
    """Create a new refresh/access pair for `user` and set both cookies."""
    refresh = RefreshToken.for_user(user)
    return set_auth_cookies(response, str(refresh.access_token), str(refresh))


def set_auth_cookies(response, access: str, refresh: str):
    response.set_cookie(
        settings.AUTH_ACCESS_COOKIE,
        access,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        path="/",
        **_cookie_kwargs(),
    )
    response.set_cookie(
        settings.AUTH_REFRESH_COOKIE,
        refresh,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        **_cookie_kwargs(),
    )
    return response


def clear_auth_cookies(response):
    response.delete_cookie(settings.AUTH_ACCESS_COOKIE, path="/", samesite=settings.AUTH_COOKIE_SAMESITE)
    response.delete_cookie(
        settings.AUTH_REFRESH_COOKIE,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        samesite=settings.AUTH_COOKIE_SAMESITE,
    )
    return response
