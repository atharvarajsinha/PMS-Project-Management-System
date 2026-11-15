from decimal import Decimal

from django.db import IntegrityError, transaction
from django.test import SimpleTestCase

from apps.common import choices
from apps.evaluations.models import EvaluatorAssignment
from apps.projects import services
from apps.projects.models import Phase
from apps.teams.tests.fixture import Phase2Fixture, day


class PhaseAdminTests(Phase2Fixture):
    def setUp(self):
        super().setUp()
        self.api = self.as_user(self.admin)

    def post(self, start, end, name="Proposal", **extra):
        body = {
            "semester_subject_id": self.daa.id, "name": name, "start_date": str(day(start)), "end_date": str(day(end)),
            "max_marks": "20", **extra,
        }
        return self.api.post("/api/v1/phases/", body, format="json")

    def test_create_and_status(self):
        r = self.post(-2, 3)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual((r.json()["status"], r.json()["order"]), ("OPEN", 1))
        self.assertEqual(self.post(10, 12, name="Design").json()["status"], "UPCOMING")

    def test_no_overlap_inclusive_days(self):
        self.post(0, 5)
        self.assertError(self.post(5, 9, name="B"), 409, "CONFLICT")  # shares day 5
        self.assertEqual(self.post(6, 9, name="B").status_code, 201)
        # other subjects are independent
        r = self.api.post("/api/v1/phases/", {"semester_subject_id": self.dsa.id, "name": "X", "start_date": str(day(0)), "end_date": str(day(5)), "max_marks": "5"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)

    def test_overlap_on_edit(self):
        self.post(0, 5)
        p2 = self.post(6, 9, name="B").json()["id"]
        self.assertError(self.api.patch(f"/api/v1/phases/{p2}/", {"start_date": str(day(4))}, format="json"), 409, "CONFLICT")

    def test_database_exclusion_constraint(self):
        self.make_phase(start=0, end=5)
        clash = Phase(semester_subject=self.daa, name="Clash", start_date=day(3), end_date=day(8), max_marks=Decimal(1))
        with self.assertRaises(IntegrityError), transaction.atomic():
            clash.save()

    def test_validation(self):
        self.assertError(self.post(5, 5), 400, "VALIDATION_ERROR")  # end must be after start
        self.assertError(self.post(0, 5, evaluation_end_date=str(day(4))), 400, "VALIDATION_ERROR")
        self.assertError(self.post(0, 5, max_marks="0"), 400, "VALIDATION_ERROR")
        self.post(0, 5)
        self.assertError(self.post(10, 12), 400, "VALIDATION_ERROR")  # duplicate name

    def test_lock_unlock(self):
        open_phase = self.make_phase(start=-2, end=2)
        self.assertError(self.api.post(f"/api/v1/phases/{open_phase.id}/lock/"), 409, "CONFLICT")
        closed = self.make_phase(start=-20, end=-10, name="Old")
        r = self.api.post(f"/api/v1/phases/{closed.id}/lock/")
        self.assertEqual(r.json()["status"], "LOCKED")
        self.assertError(self.api.patch(f"/api/v1/phases/{closed.id}/", {"name": "New"}, format="json"), 409, "CONFLICT")
        self.assertEqual(self.api.post(f"/api/v1/phases/{closed.id}/unlock/").json()["status"], "CLOSED")

    def test_reorder(self):
        p1 = self.make_phase(start=0, end=2)
        p2 = self.make_phase(start=3, end=5)
        r = self.api.post("/api/v1/phases/reorder/", {"semester_subject_id": self.daa.id, "ids": [p2.id, p1.id]}, format="json")
        self.assertEqual([p["id"] for p in r.json()], [p2.id, p1.id])
        self.assertError(
            self.api.post("/api/v1/phases/reorder/", {"semester_subject_id": self.daa.id, "ids": [p1.id]}, format="json"),
            400, "VALIDATION_ERROR",
        )

    def test_new_phase_gets_evaluators_for_existing_teams(self):
        team_id = self.create_team(self.a1, members=[self.b1])
        r = self.post(0, 5)
        self.assertEqual(EvaluatorAssignment.objects.get(team_id=team_id, phase_id=r.json()["id"]).evaluator_id, self.x.id)
        self.assertEqual(r.json()["stats"]["teams_count"], 1)

    def test_delete_cascades(self):
        team_id = self.create_team(self.a1, members=[self.b1])
        phase = self.make_phase()
        self.assertEqual(self.api.delete(f"/api/v1/phases/{phase.id}/").status_code, 204)
        self.assertFalse(EvaluatorAssignment.objects.filter(team_id=team_id).exists())


class PhaseJobTests(Phase2Fixture):
    def test_auto_lock_and_no_relock_after_manual_unlock(self):
        phase = self.make_phase(start=-20, end=-10, eval_end=-5)
        upcoming = self.make_phase(start=10, end=20)
        Phase.objects.filter(pk=upcoming.pk).update(status="OPEN")  # stale stored status
        result = services.sync_statuses()
        self.assertEqual(result["phases_auto_locked"], 1)
        phase.refresh_from_db()
        upcoming.refresh_from_db()
        self.assertEqual((phase.status, upcoming.status), ("LOCKED", "UPCOMING"))
        services.unlock_phase(phase, self.admin)
        self.assertEqual(services.sync_statuses()["phases_auto_locked"], 0)
        phase.refresh_from_db()
        self.assertEqual(phase.status, "CLOSED")

    def test_jobs_endpoint_runs_phase_sync(self):
        with self.settings_override():
            r = self.client.get("/api/v1/jobs/run/", {"token": "secret"})
        self.assertIn("phases_updated", r.json())

    def settings_override(self):
        from django.test import override_settings

        return override_settings(JOBS_SECRET="secret")


class SubmissionTests(Phase2Fixture):
    def setUp(self):
        super().setUp()
        self.team_id = self.create_team(self.a1, members=[self.b1])

    def put(self, student, phase, **body):
        body.setdefault("links", [{"link_type": "REPOSITORY", "url": "https://github.com/x/y"}])
        return self.as_student(student).put(f"/api/v1/my/teams/{self.team_id}/phases/{phase.id}/submission/", body, format="json")

    def test_any_member_submits_while_open(self):
        phase = self.make_phase(start=-1, end=1)
        r = self.put(self.b1, phase)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["status"], len(r.json()["links"])), ("SUBMITTED", 1))
        r = self.put(self.a1, phase, links=[], submit=False)  # back to draft, links replaced
        self.assertEqual((r.json()["status"], r.json()["links"]), ("DRAFT", []))
        self.assertError(self.put(self.a1, phase, links=[]), 400, "VALIDATION_ERROR")  # submit needs a link

    def test_closed_and_upcoming_rejected(self):
        self.assertError(self.put(self.a1, self.make_phase(start=-10, end=-1)), 409, "CONFLICT")
        self.assertError(self.put(self.a1, self.make_phase(start=2, end=9)), 409, "CONFLICT")

    def test_bad_link(self):
        phase = self.make_phase(start=-1, end=1)
        self.assertError(self.put(self.a1, phase, links=[{"link_type": "DEMO", "url": "ftp://x.y/z"}]), 400, "VALIDATION_ERROR")

    def test_projects_overview_has_no_marks(self):
        self.make_phase(start=-1, end=1)
        r = self.as_student(self.a1).get("/api/v1/my/projects/")
        self.assertEqual(r.status_code, 200, r.content)
        daa = next(s for s in r.json()["subjects"] if s["semester_subject"]["id"] == self.daa.id)
        self.assertTrue(daa["is_lead"])
        self.assertEqual(daa["phases"][0]["status"], "OPEN")
        self.assertNotIn('"marks"', r.content.decode())


class ChoicesTests(SimpleTestCase):
    def test_frontend_copy_is_current(self):
        from apps.common.management.commands.export_choices import FRONTEND_FILE, render

        self.assertTrue(FRONTEND_FILE.exists(), "Run: python manage.py export_choices")
        self.assertEqual(
            FRONTEND_FILE.read_text(encoding="utf-8"), render(),
            "frontend/src/config/choices.generated.js is out of date. Run: python manage.py export_choices",
        )

    def test_models_use_the_central_choices(self):
        from apps.accounts.models import User
        from apps.colleges.models import College

        self.assertIs(User.Role, choices.Role)
        self.assertIs(User.Status, choices.AccountStatus)
        self.assertIs(College.Status, choices.CollegeStatus)
        self.assertIs(Phase.Status, choices.PhaseStatus)
