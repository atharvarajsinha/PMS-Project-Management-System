from unittest import mock

from django.core import mail
from django.test import override_settings

from apps.common import emails
from apps.common.tests.base import PMSTestCase


class AsyncEmailTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.admin = self.client_for(self.make_admin(self.college))
        self.faculty = self.make_faculty(self.college, active=False, email="new@x.edu")

    @override_settings(EMAIL_ASYNC=True)
    def test_activation_email_is_handed_to_the_background_pool(self):
        with mock.patch.object(emails._executor, "submit") as submit, self.captureOnCommitCallbacks(execute=True):
            r = self.admin.post(f"/api/v1/faculty/{self.faculty.id}/activate/")
        self.assertEqual(r.status_code, 200, r.content)
        submit.assert_called_once()  # the request didn't send it
        self.assertEqual(len(mail.outbox), 0)
        submit.call_args.args[0]()  # run the background task here: it sends the email
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(EMAIL_ASYNC=True)
    def test_password_reset_otp_is_sent_in_the_background(self):
        user = self.make_user("FACULTY", self.college, email="otp@x.edu")
        with mock.patch.object(emails._executor, "submit") as submit, self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/v1/auth/password-reset/request/", {"email": user.email}, format="json")
        self.assertLess(r.status_code, 300, r.content)
        submit.assert_called_once()
        self.assertEqual(len(mail.outbox), 0)
