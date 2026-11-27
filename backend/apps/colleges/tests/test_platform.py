import re

from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.colleges.models import College, CollegeSettings
from apps.common.emails import process_outbox
from apps.common.models import AuditLog, EmailOutbox
from apps.common.tests.base import PMSTestCase


class PlatformCollegeTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.root = self.make_super_admin()
        self.login(self.root)

    def test_create_college_creates_settings_and_audit(self):
        r = self.client.post(
            "/api/v1/platform/colleges/", {"name": "Sitare University", "code": "sitare"}, format="json"
        )
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(body["code"], "SITARE")
        self.assertEqual(body["status"], "ACTIVE")
        self.assertIsNone(body["admin"])
        self.assertEqual(body["stats"], {"faculty": 0, "students": 0, "semesters": 0})
        self.assertTrue(CollegeSettings.objects.filter(college_id=body["id"]).exists())
        self.assertTrue(AuditLog.objects.filter(action="college.create", entity_id=body["id"]).exists())

        r = self.client.post("/api/v1/platform/colleges/", {"name": "Dup", "code": "SITARE"}, format="json")
        self.assertError(r, 409, "CONFLICT")
        self.assertIn("code", r.json()["error"]["details"])

    def test_list_search_and_stats(self):
        college = self.make_college("BETA")
        self.make_faculty(college)
        self.make_faculty(college)
        self.make_semester(college)
        r = self.client.get("/api/v1/platform/colleges/?search=bet")
        self.assertEqual(r.json()["count"], 1)
        self.assertEqual(r.json()["results"][0]["stats"], {"faculty": 2, "students": 0, "semesters": 1})

    def test_only_super_admin(self):
        college = self.make_college()
        admin = self.make_admin(college)
        client = self.client_for(admin)
        self.assertError(client.get("/api/v1/platform/colleges/"), 403, "PERMISSION_DENIED")

    def test_college_admin_lifecycle_and_credentials_email(self):
        college = self.make_college()
        base = f"/api/v1/platform/colleges/{college.id}/admin/"
        self.assertError(self.client.get(base), 404, "NOT_FOUND")

        r = self.client.post(base, {"name": "Head Admin", "email": "Head@College.edu"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["status"], "INACTIVE")
        self.assertError(self.client.post(base, {"name": "Second", "email": "two@college.edu"}, format="json"), 409, "CONFLICT")

        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(f"{base}activate/")
        self.assertEqual(r.status_code, 200, r.content)
        # sent right after the activation commits; nothing left for the job
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["head@college.edu"])
        self.assertEqual(EmailOutbox.objects.get().status, "SENT")
        self.assertEqual(process_outbox(), {"emails_sent": 0, "emails_failed": 0})
        temp = re.search(r"Temporary password: (\S+)", mail.outbox[0].body).group(1)
        admin = User.objects.get(email="head@college.edu")
        r = self.login(admin, password=temp, client=APIClient())
        self.assertTrue(r.json()["user"]["must_change_password"])

        self.assertEqual(self.client.post(f"{base}deactivate/").status_code, 200)
        self.assertError(self.client.post(f"{base}resend-credentials/"), 409, "CONFLICT")
        self.assertEqual(self.client.delete(base).status_code, 204)
        self.assertFalse(User.objects.filter(email="head@college.edu").exists())

    def test_deactivate_college_blocks_its_users(self):
        college = self.make_college()
        admin = self.make_admin(college)
        admin_client = self.client_for(admin)
        r = self.client.post(f"/api/v1/platform/colleges/{college.id}/deactivate/")
        self.assertEqual(r.json()["status"], "INACTIVE")
        self.assertError(admin_client.get("/api/v1/me/"), 403, "COLLEGE_INACTIVE")
        self.assertError(self.client.post(f"/api/v1/platform/colleges/{college.id}/deactivate/"), 409, "CONFLICT")

    def test_delete_college_requires_code_confirmation(self):
        college = self.make_college("GAMMA")
        section = self.make_section(self.make_semester(college))
        self.make_student(section)
        url = f"/api/v1/platform/colleges/{college.id}/"
        self.assertError(self.client.delete(url), 400, "VALIDATION_ERROR")
        self.assertEqual(self.client.delete(url + "?confirm=gamma").status_code, 204)
        self.assertFalse(College.objects.filter(pk=college.pk).exists())
        self.assertFalse(User.objects.filter(college_id=college.pk).exists())

    def test_super_admin_needs_college_context(self):
        college = self.make_college()
        self.assertError(self.client.get("/api/v1/semesters/"), 400, "COLLEGE_CONTEXT_REQUIRED")
        self.assertError(
            self.client.get("/api/v1/semesters/", HTTP_X_COLLEGE_ID="not-a-number"), 404, "NOT_FOUND"
        )
        r = self.client.post(
            "/api/v1/semesters/", {"semester_number": 3}, format="json", HTTP_X_COLLEGE_ID=str(college.id)
        )
        self.assertEqual(r.status_code, 201, r.content)
        log = AuditLog.objects.get(action="semester.create")
        self.assertEqual(log.college_id, college.id)
        self.assertEqual(log.actor_role, "SUPER_ADMIN")


class SettingsTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.admin = self.make_admin(self.college)

    def test_admin_updates_settings(self):
        client = self.client_for(self.admin)
        r = client.patch("/api/v1/settings/", {"min_team_size": 3, "max_team_size": 5, "team_formation_enabled": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body["min_team_size"], body["max_team_size"]), (3, 5))
        self.assertEqual((body["teams_locked"], body["teams_locked_at"]), (False, None))
        self.assertEqual(body["updated_by"]["id"], self.admin.id)
        # closing team formation locks every team; teams_locked can't be set on its own
        r = client.patch("/api/v1/settings/", {"team_formation_enabled": False, "teams_locked": False}, format="json")
        body = r.json()
        self.assertTrue(body["teams_locked"])
        self.assertIsNotNone(body["teams_locked_at"])
        self.assertNotIn("allow_cross_section_evaluation", body)
        # reopening unlocks
        body = client.patch("/api/v1/settings/", {"team_formation_enabled": True}, format="json").json()
        self.assertEqual((body["teams_locked"], body["teams_locked_at"]), (False, None))

        r = client.patch("/api/v1/settings/", {"max_team_size": 2}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.assertIn("max_team_size", r.json()["error"]["details"])

        r = client.patch("/api/v1/settings/", {"min_team_size": 1}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")

    def test_faculty_reads_but_cannot_write(self):
        faculty = self.make_faculty(self.college)
        client = self.client_for(faculty.user)
        self.assertEqual(client.get("/api/v1/settings/").status_code, 200)
        self.assertError(client.patch("/api/v1/settings/", {"min_team_size": 3}, format="json"), 403, "PERMISSION_DENIED")
        college = client.get("/api/v1/college/").json()
        self.assertNotIn("admin", college)


class JobsTests(PMSTestCase):
    def test_jobs_endpoint_requires_secret(self):
        with self.settings(JOBS_SECRET="s3cret"):
            self.assertError(self.client.get("/api/v1/jobs/run/?token=wrong"), 404, "NOT_FOUND")
            r = self.client.get("/api/v1/jobs/run/?token=s3cret")
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json(), {"emails_sent": 0, "emails_failed": 0, "phases_updated": 0, "phases_auto_locked": 0})

    def test_health(self):
        self.assertEqual(self.client.get("/api/v1/health/").json()["status"], "ok")
