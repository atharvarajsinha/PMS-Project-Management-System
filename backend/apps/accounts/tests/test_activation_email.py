import re
from unittest import mock

from django.core import mail
from rest_framework.test import APIClient

from apps.common.emails import process_outbox
from apps.common.models import EmailOutbox
from apps.common.tests.base import PMSTestCase


class ActivationEmailTests(PMSTestCase):
    """Activation emails go out right after the request commits, for every role."""

    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.client = self.client_for(self.make_admin(self.college))
        self.section = self.make_section(self.make_semester(self.college))

    def activate(self, url):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(url)

    def temp_password(self, email):
        message = next(m for m in mail.outbox if m.to == [email])
        return re.search(r"Temporary password: (\S+)", message.body).group(1)

    def test_faculty_activation_sends_working_credentials(self):
        faculty = self.make_faculty(self.college, email="fac@x.edu", active=False)
        r = self.activate(f"/api/v1/faculty/{faculty.id}/activate/")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("activated", mail.outbox[0].body)
        html, mimetype = mail.outbox[0].alternatives[0]
        self.assertEqual(mimetype, "text/html")
        self.assertIn(self.temp_password("fac@x.edu"), html)

        r = self.login(faculty.user, password=self.temp_password("fac@x.edu"), client=APIClient())
        self.assertTrue(r.json()["user"]["must_change_password"])

    def test_student_activation_sends_email(self):
        student = self.make_student(self.section, email="stu@x.edu", active=False)
        self.activate(f"/api/v1/students/{student.id}/activate/")
        self.assertEqual([m.to for m in mail.outbox], [["stu@x.edu"]])
        self.assertEqual(EmailOutbox.objects.get().status, "SENT")

    def test_bulk_activation_sends_one_email_each(self):
        for i in range(3):
            self.make_student(self.section, roll=f"R{i}", email=f"s{i}@x.edu", active=False)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post("/api/v1/students/bulk-activate/", {"section_id": self.section.id}, format="json")
        self.assertEqual(len(r.json()["succeeded"]), 3)
        self.assertEqual(sorted(m.to[0] for m in mail.outbox), ["s0@x.edu", "s1@x.edu", "s2@x.edu"])

    def test_resend_credentials_sends_new_password(self):
        faculty = self.make_faculty(self.college, email="fac@x.edu")
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(f"/api/v1/faculty/{faculty.id}/resend-credentials/")
        self.assertEqual(r.status_code, 202)
        self.login(faculty.user, password=self.temp_password("fac@x.edu"), client=APIClient())

    def test_smtp_failure_keeps_email_queued_for_the_job(self):
        faculty = self.make_faculty(self.college, email="fac@x.edu", active=False)
        with mock.patch("apps.common.emails.EmailMultiAlternatives.send", side_effect=OSError("SMTP down")):
            r = self.activate(f"/api/v1/faculty/{faculty.id}/activate/")
        self.assertEqual(r.status_code, 200)  # activation itself succeeds
        item = EmailOutbox.objects.get()
        self.assertEqual((item.status, item.attempts), ("PENDING", 1))
        self.assertIn("SMTP down", item.last_error)

        # the UptimeRobot job retries it
        self.assertEqual(process_outbox(), {"emails_sent": 1, "emails_failed": 0})
        self.login(faculty.user, password=self.temp_password("fac@x.edu"), client=APIClient())

    def test_time_budget_leaves_rest_for_the_job(self):
        for i in range(3):
            self.make_student(self.section, roll=f"R{i}", email=f"s{i}@x.edu", active=False)
        with self.settings(EMAIL_SEND_TIME_BUDGET_SECONDS=-1):  # budget already used up
            with self.captureOnCommitCallbacks(execute=True):
                self.client.post("/api/v1/students/bulk-activate/", {"section_id": self.section.id}, format="json")
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(EmailOutbox.objects.filter(status="PENDING").count(), 3)
        self.assertEqual(process_outbox(), {"emails_sent": 3, "emails_failed": 0})
