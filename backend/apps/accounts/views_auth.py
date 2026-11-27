"""Auth endpoints (docs/API.md §7) and /me (§8)."""

from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.middleware.csrf import get_token
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.common import audit
from apps.common.authentication import (
    SAFE_METHODS,
    check_user_access,
    clear_auth_cookies,
    enforce_csrf,
    issue_session,
    set_auth_cookies,
)
from apps.common.emails import render_email, send_later
from apps.common.exceptions import (
    InvalidCredentials,
    InvalidInput,
    PasswordChangeRequired,
    RefreshInvalid,
    error_response,
)
from apps.common.passwords import generate_otp, hash_otp, otp_matches
from apps.common.throttles import LoginThrottle, PasswordResetThrottle

from . import services
from .models import PasswordResetOTP, User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    MeSerializer,
    MeUpdateSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PasswordResetVerifySerializer,
    validate_new_password,
)

RESET_TOKEN_SALT = "pms.password-reset"


class PublicAuthView(APIView):
    """No authentication, but unsafe methods still need a valid CSRF token."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method not in SAFE_METHODS:
            enforce_csrf(request)


def me_payload(user):
    return MeSerializer(user).data


@extend_schema(tags=["auth"], responses={204: None})
class CsrfView(PublicAuthView):
    def get(self, request):
        token = get_token(request)  # CsrfViewMiddleware sets the csrftoken cookie on the response
        # Also in a header: a frontend on another domain can't read our cookie (CORS exposes this header)
        return Response(status=status.HTTP_204_NO_CONTENT, headers={"X-CSRFToken": token})


@extend_schema(tags=["auth"], request=LoginSerializer, responses={200: MeSerializer})
class LoginView(PublicAuthView):
    throttle_classes = [LoginThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email, password = serializer.validated_data["email"], serializer.validated_data["password"]

        user = User.objects.select_related("college").filter(email=email).first()
        if user is None:
            User().set_password(password)  # equalize timing with the found-user path
            raise InvalidCredentials()
        if not user.check_password(password):
            raise InvalidCredentials()
        check_user_access(user)

        user.last_login_at = timezone.now()
        user.save(update_fields=["last_login_at"])
        audit.record(request, "auth.login", user, actor=user)

        response = Response({"user": me_payload(user)})
        return issue_session(response, user)


@extend_schema(tags=["auth"], request=None, responses={204: None})
class RefreshView(PublicAuthView):
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE)
        if not raw:
            raise RefreshInvalid()
        serializer = TokenRefreshSerializer(data={"refresh": raw})
        try:
            serializer.is_valid(raise_exception=True)
        except (TokenError, exceptions.APIException, User.DoesNotExist):
            response = error_response(RefreshInvalid)
            return clear_auth_cookies(response)
        data = serializer.validated_data
        response = Response(status=status.HTTP_204_NO_CONTENT)
        return set_auth_cookies(response, data["access"], data["refresh"])


@extend_schema(tags=["auth"], request=None, responses={204: None})
class LogoutView(PublicAuthView):
    def post(self, request):
        raw = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass
        return clear_auth_cookies(Response(status=status.HTTP_204_NO_CONTENT))


@extend_schema(tags=["auth"], request=ChangePasswordSerializer, responses={200: MeSerializer})
class ChangePasswordView(APIView):
    allow_pending_password_change = True

    def post(self, request):
        user = request.user
        serializer = ChangePasswordSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)

        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        services.revoke_sessions(user)
        audit.record(request, "auth.change_password", user)

        response = Response({"user": me_payload(user)})
        return issue_session(response, user)


# ---------------------------------------------------------------- password reset


def _reset_token(user, otp):
    return signing.dumps({"u": str(user.id), "o": str(otp.id), "p": user.password[-16:]}, salt=RESET_TOKEN_SALT)


@extend_schema(tags=["auth"], request=PasswordResetRequestSerializer, responses={202: None})
class PasswordResetRequestView(PublicAuthView):
    throttle_classes = [PasswordResetThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = User.objects.select_related("college").filter(email=serializer.validated_data["email"]).first()
        if user is not None and user.is_active and user.college_is_active:
            self._issue_otp(request, user)
        # Same response whether or not the account exists
        return Response(status=status.HTTP_202_ACCEPTED)

    def _issue_otp(self, request, user):
        now = timezone.now()
        purpose = PasswordResetOTP.Purpose.PASSWORD_RESET
        last = PasswordResetOTP.objects.filter(user=user, purpose=purpose).order_by("-created_at").first()
        if last and last.created_at > now - timedelta(seconds=settings.OTP_RESEND_COOLDOWN_SECONDS):
            return

        PasswordResetOTP.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=now)
        otp = generate_otp()
        PasswordResetOTP.objects.create(
            user=user,
            purpose=purpose,
            otp_hash=hash_otp(otp),
            expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
        )
        subject, text, html = render_email(
            "password_reset_otp", user, otp=otp, minutes=settings.OTP_TTL_SECONDS // 60
        )
        send_later(user.email, subject, text, html)
        audit.record(request, "auth.password_reset_request", user, actor=user)


@extend_schema(tags=["auth"], request=PasswordResetVerifySerializer, responses={200: dict})
class PasswordResetVerifyView(PublicAuthView):
    INVALID = {"otp": ["Invalid or expired code."]}

    def post(self, request):
        serializer = PasswordResetVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email, code = serializer.validated_data["email"], serializer.validated_data["otp"]

        otp = (
            PasswordResetOTP.objects.select_related("user")
            .filter(
                user__email=email,
                purpose=PasswordResetOTP.Purpose.PASSWORD_RESET,
                used_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .order_by("-created_at")
            .first()
        )
        if otp is None or otp.attempts >= settings.OTP_MAX_ATTEMPTS:
            return error_response(InvalidInput, details=self.INVALID)

        if not otp_matches(code, otp.otp_hash):
            # returned (not raised) so the attempt counter is committed
            otp.attempts += 1
            otp.save(update_fields=["attempts"])
            return error_response(InvalidInput, details=self.INVALID)

        otp.used_at = timezone.now()
        otp.save(update_fields=["used_at"])
        return Response({"reset_token": _reset_token(otp.user, otp), "expires_in": settings.PASSWORD_RESET_TOKEN_TTL_SECONDS})


@extend_schema(tags=["auth"], request=PasswordResetConfirmSerializer, responses={204: None})
class PasswordResetConfirmView(PublicAuthView):
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invalid = InvalidInput(details={"reset_token": ["This reset link is invalid or has expired."]})

        try:
            payload = signing.loads(
                serializer.validated_data["reset_token"],
                salt=RESET_TOKEN_SALT,
                max_age=settings.PASSWORD_RESET_TOKEN_TTL_SECONDS,
            )
            user = User.objects.select_related("college").get(id=payload["u"])
        except (signing.BadSignature, User.DoesNotExist, KeyError, ValueError):
            raise invalid
        # one-time use: the token embeds part of the old password hash
        if user.password[-16:] != payload.get("p") or not user.is_active:
            raise invalid

        new_password = serializer.validated_data["new_password"]
        validate_new_password(new_password, user)
        user.set_password(new_password)
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        services.revoke_sessions(user)
        audit.record(request, "auth.password_reset", user, actor=user)
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- /me


@extend_schema(tags=["me"])
class MeView(APIView):
    allow_pending_password_change = True

    @extend_schema(responses={200: MeSerializer})
    def get(self, request):
        return Response(me_payload(request.user))

    @extend_schema(request=MeUpdateSerializer, responses={200: MeSerializer})
    def patch(self, request):
        user = request.user
        if user.must_change_password:
            raise PasswordChangeRequired()
        old = audit.snapshot(user, ["name", "phone"])
        serializer = MeUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        audit.record(request, "profile.update", user, old=old, new=audit.snapshot(user, ["name", "phone"]))
        return Response(me_payload(user))
