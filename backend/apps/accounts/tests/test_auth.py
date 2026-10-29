import re
from datetime import timedelta

from django.conf import settings
from django.core import mail
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User
from apps.colleges.models import College
from apps.common.models import AuditLog
from apps.common.tests.base import PASSWORD, PMSTestCase


class LoginTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.admin = self.make_admin(self.college, email="Admin@Example.com")

    def test_login_sets_httponly_cookies_and_returns_me(self):
        response = self.client.post(
            "/api/v1/auth/login/", {"email": " ADMIN@example.com ", "password": PASSWORD}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()["user"]
        self.assertEqual(body["email"], "admin@example.com")
        self.assertEqual(body["role"], "ADMIN")
        self.assertEqual(body["college"]["code"], "ALPHA")
        self.assertTrue(response.cookies[settings.AUTH_ACCESS_COOKIE]["httponly"])
        self.assertEqual(response.cookies[settings.AUTH_REFRESH_COOKIE]["path"], "/api/v1/auth/")
        self.assertTrue(AuditLog.objects.filter(action="auth.login", actor=self.admin).exists())

    def test_wrong_password_and_unknown_email(self):
        r = self.client.post("/api/v1/auth/login/", {"email": self.admin.email, "password": "nope"}, format="json")
        self.assertError(r, 401, "INVALID_CREDENTIALS")
        r = self.client.post("/api/v1/auth/login/", {"email": "x@y.com", "password": "nope"}, format="json")
        self.assertError(r, 401, "INVALID_CREDENTIALS")

    def test_inactive_user_and_inactive_college(self):
        self.admin.status = User.Status.INACTIVE
        self.admin.save()
        r = self.client.post("/api/v1/auth/login/", {"email": self.admin.email, "password": PASSWORD}, format="json")
        self.assertError(r, 403, "ACCOUNT_INACTIVE")

        self.admin.status = User.Status.ACTIVE
        self.admin.save()
        self.college.status = College.Status.INACTIVE
        self.college.save()
        r = self.client.post("/api/v1/auth/login/", {"email": self.admin.email, "password": PASSWORD}, format="json")
        self.assertError(r, 403, "COLLEGE_INACTIVE")

    def test_login_is_rate_limited(self):
        for _ in range(5):
            self.client.post("/api/v1/auth/login/", {"email": self.admin.email, "password": "bad"}, format="json")
        r = self.client.post("/api/v1/auth/login/", {"email": self.admin.email, "password": "bad"}, format="json")
        self.assertError(r, 429, "RATE_LIMITED")
        self.assertIn("Retry-After", r.headers)

    def test_validation_error_shape(self):
        r = self.client.post("/api/v1/auth/login/", {"email": "not-an-email"}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")
        details = r.json()["error"]["details"]
        self.assertIn("email", details)
        self.assertIn("password", details)


class SessionTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.admin = self.make_admin(self.college)

    def test_me_requires_login(self):
        self.assertError(self.client.get("/api/v1/me/"), 401, "NOT_AUTHENTICATED")

    def test_expired_access_token(self):
        token = AccessToken.for_user(self.admin)
        token.set_exp(lifetime=-timedelta(seconds=5))
        self.client.cookies[settings.AUTH_ACCESS_COOKIE] = str(token)
        self.assertError(self.client.get("/api/v1/me/"), 401, "TOKEN_EXPIRED")

    def test_refresh_rotates_and_old_refresh_is_revoked(self):
        self.login(self.admin)
        old_refresh = self.client.cookies[settings.AUTH_REFRESH_COOKIE].value
        r = self.client.post("/api/v1/auth/refresh/")
        self.assertEqual(r.status_code, 204)
        self.assertNotEqual(self.client.cookies[settings.AUTH_REFRESH_COOKIE].value, old_refresh)
        self.assertEqual(self.client.get("/api/v1/me/").status_code, 200)

        replay = APIClient()
        replay.cookies[settings.AUTH_REFRESH_COOKIE] = old_refresh
        self.assertError(replay.post("/api/v1/auth/refresh/"), 401, "REFRESH_INVALID")

    def test_logout_revokes_refresh(self):
        self.login(self.admin)
        refresh = self.client.cookies[settings.AUTH_REFRESH_COOKIE].value
        self.assertEqual(self.client.post("/api/v1/auth/logout/").status_code, 204)
        other = APIClient()
        other.cookies[settings.AUTH_REFRESH_COOKIE] = refresh
        self.assertError(other.post("/api/v1/auth/refresh/"), 401, "REFRESH_INVALID")

    def test_deactivated_user_is_blocked_immediately(self):
        self.login(self.admin)
        self.admin.status = User.Status.INACTIVE
        self.admin.save()
        self.assertError(self.client.get("/api/v1/me/"), 403, "ACCOUNT_INACTIVE")

    def test_csrf_flow_with_token(self):
        client = APIClient(enforce_csrf_checks=True)
        r = client.post("/api/v1/auth/login/", {"email": self.admin.email, "password": PASSWORD}, format="json")
        self.assertError(r, 403, "CSRF_FAILED")

        self.assertEqual(client.get("/api/v1/auth/csrf/").status_code, 204)
        token = client.cookies[settings.CSRF_COOKIE_NAME].value
        r = client.post(
            "/api/v1/auth/login/",
            {"email": self.admin.email, "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(r.status_code, 200)
        # authenticated unsafe request without the header is rejected
        self.assertError(client.patch("/api/v1/me/", {"name": "X"}, format="json"), 403, "CSRF_FAILED")
        r = client.patch("/api/v1/me/", {"name": "New Name"}, format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["name"], "New Name")


class PasswordChangeTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.faculty = self.make_faculty(self.college, must_change=True)
        self.user = self.faculty.user

    def test_temporary_password_gates_everything_but_me_and_change(self):
        self.login(self.user)
        self.assertEqual(self.client.get("/api/v1/me/").status_code, 200)
        self.assertError(self.client.get("/api/v1/college/"), 403, "PASSWORD_CHANGE_REQUIRED")
        self.assertError(self.client.patch("/api/v1/me/", {"name": "x"}, format="json"), 403, "PASSWORD_CHANGE_REQUIRED")

        r = self.client.post(
            "/api/v1/auth/change-password/",
            {"current_password": PASSWORD, "new_password": "BrandNew123"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.json()["user"]["must_change_password"])
        self.assertEqual(self.client.get("/api/v1/college/").status_code, 200)

    def test_change_password_validation(self):
        self.login(self.user)
        r = self.client.post(
            "/api/v1/auth/change-password/", {"current_password": "wrong", "new_password": "abc"}, format="json"
        )
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.assertIn("current_password", r.json()["error"]["details"])

        r = self.client.post(
            "/api/v1/auth/change-password/",
            {"current_password": PASSWORD, "new_password": "onlyletters"},
            format="json",
        )
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.assertIn("new_password", r.json()["error"]["details"])


class PasswordResetTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.user = self.make_faculty(self.college, email="fac@example.com").user

    def _request(self, email="fac@example.com"):
        return self.client.post("/api/v1/auth/password-reset/request/", {"email": email}, format="json")

    def _otp_from_mail(self):
        return re.search(r"code is: (\d{6})", mail.outbox[-1].body).group(1)

    def test_full_reset_flow(self):
        self.assertEqual(self._request().status_code, 202)
        self.assertEqual(len(mail.outbox), 1)
        otp = self._otp_from_mail()

        r = self.client.post(
            "/api/v1/auth/password-reset/verify/", {"email": "fac@example.com", "otp": otp}, format="json"
        )
        self.assertEqual(r.status_code, 200, r.content)
        token = r.json()["reset_token"]

        r = self.client.post(
            "/api/v1/auth/password-reset/confirm/", {"reset_token": token, "new_password": "ResetPass99"}, format="json"
        )
        self.assertEqual(r.status_code, 204, r.content)
        self.login(self.user, password="ResetPass99")

        # token is single-use
        r = self.client.post(
            "/api/v1/auth/password-reset/confirm/", {"reset_token": token, "new_password": "Another99x"}, format="json"
        )
        self.assertError(r, 400, "VALIDATION_ERROR")

    def test_unknown_email_gets_same_response_and_no_mail(self):
        self.assertEqual(self._request("ghost@example.com").status_code, 202)
        self.assertEqual(len(mail.outbox), 0)

    def test_otp_burns_after_max_attempts(self):
        self._request()
        otp = self._otp_from_mail()
        wrong = "000000" if otp != "000000" else "111111"
        for _ in range(settings.OTP_MAX_ATTEMPTS):
            r = self.client.post(
                "/api/v1/auth/password-reset/verify/", {"email": "fac@example.com", "otp": wrong}, format="json"
            )
            self.assertError(r, 400, "VALIDATION_ERROR")
        r = self.client.post(
            "/api/v1/auth/password-reset/verify/", {"email": "fac@example.com", "otp": otp}, format="json"
        )
        self.assertError(r, 400, "VALIDATION_ERROR")

    def test_resend_cooldown(self):
        self._request()
        self._request()
        self.assertEqual(len(mail.outbox), 1)


class MeTests(PMSTestCase):
    def test_student_me_and_profile_update(self):
        college = self.make_college()
        section = self.make_section(self.make_semester(college, 5), "B")
        student = self.make_student(section, roll="CSE001")
        self.login(student.user)

        me = self.client.get("/api/v1/me/").json()
        self.assertEqual(me["student"]["roll_number"], "CSE001")
        self.assertEqual(me["student"]["semester"]["semester_number"], 5)
        self.assertEqual(me["student"]["section"]["name"], "B")
        self.assertIsNone(me["faculty"])

        r = self.client.patch("/api/v1/me/", {"phone": "+91 98765-43210"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["phone"], "+919876543210")

        r = self.client.patch("/api/v1/me/", {"phone": None}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["phone"], "")

        r = self.client.patch("/api/v1/me/", {"email": "new@example.com"}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.assertIn("email", r.json()["error"]["details"])
