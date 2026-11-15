from datetime import timedelta

from apps.common.models import AuditLog
from apps.evaluations.models import EvaluatorAssignment, StudentMark
from apps.projects import services as project_services
from apps.teams.tests.fixture import Phase2Fixture


class MarksBase(Phase2Fixture):
    """Team: Asha (A1, lead) + Bina (B1). Xavier evaluates (lead in section A). Helpers only."""

    def setUp(self):
        super().setUp()
        self.team_id = self.create_team(self.a1, members=[self.b1])
        self.x_api = self.as_faculty(self.x)

    def assignment(self, phase):
        return EvaluatorAssignment.objects.get(team_id=self.team_id, phase=phase)

    def marks(self, api, phase, default=None, students=None, prefix="my/evaluations", **extra):
        """default: mark for everyone; students: {student: marks} overrides."""
        body = {**extra}
        if default is not None:
            body["default_marks"] = str(default)
        if students:
            body["student_marks"] = [{"student_id": s.id, "marks": str(m)} for s, m in students.items()]
        a = self.assignment(phase)
        return api.put(f"/api/v1/{prefix}/{a.id}/marks/", body, format="json")

    def stored(self, phase):
        return dict(
            StudentMark.objects.filter(evaluation__assignment=self.assignment(phase)).values_list("student_id", "marks")
        )

    def submit_work(self, phase):
        """Submit while open, then move the phase into the past."""
        self.as_student(self.a1).put(
            f"/api/v1/my/teams/{self.team_id}/phases/{phase.id}/submission/",
            {"links": [{"link_type": "DEMO", "url": "https://demo.example.com"}]}, format="json",
        )
        phase.start_date -= timedelta(days=30)
        phase.end_date -= timedelta(days=30)
        phase.save()


class MarksTests(MarksBase):
    def test_evaluator_sees_only_own_teams(self):
        phase = self.make_phase(start=-20, end=-10)
        rows = self.x_api.get("/api/v1/my/evaluations/", {"phase_id": phase.id}).json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(self.as_faculty(self.y).get("/api/v1/my/evaluations/").json()["count"], 0)
        a = self.assignment(phase)
        r = self.as_faculty(self.y).put(f"/api/v1/my/evaluations/{a.id}/marks/", {"default_marks": "0"}, format="json")
        self.assertEqual(r.status_code, 404)
        picker = self.x_api.get("/api/v1/my/evaluations/phases/").json()
        self.assertEqual((picker[0]["teams"], picker[0]["evaluated"]), (1, 0))

    def test_not_before_end_date(self):
        phase = self.make_phase(start=-1, end=1)
        self.assertError(self.marks(self.x_api, phase, 0), 409, "CONFLICT")

    def test_no_submission_means_zero_for_everyone(self):
        phase = self.make_phase(start=-20, end=-10)
        self.assertError(self.marks(self.x_api, phase, 5), 400, "VALIDATION_ERROR")
        self.assertError(self.marks(self.x_api, phase, 0, students={self.b1: 3}), 400, "VALIDATION_ERROR")
        r = self.marks(self.x_api, phase, 0, remarks="Nothing submitted")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["evaluation"]["status"], "SUBMITTED")
        self.assertEqual(self.stored(phase), {self.a1.id: 0, self.b1.id: 0})

    def test_master_mark_with_individual_override(self):
        phase = self.make_phase(start=-1, end=1, max_marks="20")
        self.submit_work(phase)
        r = self.marks(self.x_api, phase, 15, students={self.b1: "17.5"})
        self.assertEqual(r.status_code, 200, r.content)
        ev = r.json()["evaluation"]
        self.assertEqual(ev["default_marks"], "15.00")
        self.assertEqual({m["student_id"]: m["marks"] for m in ev["student_marks"]}, {self.a1.id: "15.00", self.b1.id: "17.50"})
        self.assertEqual(ev["summary"], {"min": "15.00", "max": "17.50", "avg": "16.25"})
        self.assertIsNotNone(r.json()["submission"])

    def test_every_member_needs_a_mark_and_limits(self):
        phase = self.make_phase(start=-1, end=1, max_marks="20")
        self.submit_work(phase)
        self.assertError(self.marks(self.x_api, phase, students={self.a1: 10}), 400, "VALIDATION_ERROR")  # Bina missing
        self.assertError(self.marks(self.x_api, phase, 21), 400, "VALIDATION_ERROR")
        self.assertError(self.marks(self.x_api, phase, 10, students={self.b1: 25}), 400, "VALIDATION_ERROR")
        self.assertError(self.marks(self.x_api, phase, 10, students={self.a3: 5}), 400, "VALIDATION_ERROR")  # not a member
        r = self.marks(self.x_api, phase, students={self.a1: 12, self.b1: 14})  # all individual, no master
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.stored(phase), {self.a1.id: 12, self.b1.id: 14})

    def test_edit_and_audit(self):
        phase = self.make_phase(start=-1, end=1)
        self.submit_work(phase)
        self.marks(self.x_api, phase, 10)
        self.marks(self.x_api, phase, 10, students={self.a1: 18})  # still editable while CLOSED
        log = AuditLog.objects.filter(action="evaluation.marks").order_by("-id").first()
        self.assertEqual(log.old_values["students"][str(self.a1.id)], "10.00")
        self.assertEqual(log.new_values["students"][str(self.a1.id)], "18.00")

    def test_lock_and_admin_correction(self):
        phase = self.make_phase(start=-1, end=1)
        self.submit_work(phase)
        admin = self.as_user(self.admin)
        # the Admin can't evaluate first-hand
        self.assertError(self.marks(admin, phase, 10, prefix="evaluations"), 409, "CONFLICT")
        self.marks(self.x_api, phase, 10)
        project_services.lock_phase(phase, self.admin)
        self.assertError(self.marks(self.x_api, phase, 12), 409, "CONFLICT")
        self.assertError(self.marks(admin, phase, 12, prefix="evaluations"), 409, "CONFLICT")
        project_services.unlock_phase(phase, self.admin)
        r = self.marks(admin, phase, 10, students={self.b1: 12}, prefix="evaluations")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.stored(phase), {self.a1.id: 10, self.b1.id: 12})
        self.assertTrue(AuditLog.objects.filter(action="evaluation.correct").exists())

    def test_phase_max_cant_drop_below_given_marks(self):
        phase = self.make_phase(start=-1, end=1, max_marks="20")
        self.submit_work(phase)
        self.marks(self.x_api, phase, 10, students={self.b1: 18})
        r = self.as_user(self.admin).patch(f"/api/v1/phases/{phase.id}/", {"max_marks": "15"}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")

    def test_admin_list_and_filters(self):
        phase = self.make_phase(start=-20, end=-10)
        admin = self.as_user(self.admin)
        self.assertEqual(admin.get("/api/v1/evaluations/", {"phase_id": phase.id, "evaluated": "false"}).json()["count"], 1)
        self.marks(self.x_api, phase, 0)
        self.assertEqual(admin.get("/api/v1/evaluations/", {"phase_id": phase.id, "evaluated": "true"}).json()["count"], 1)

    def test_evaluator_names_team(self):
        phase = self.make_phase(start=-20, end=-10)
        a = self.assignment(phase)
        r = self.x_api.post(f"/api/v1/my/evaluations/{a.id}/team-name/", {"name": "Byte Busters"}, format="json")
        self.assertEqual(r.json()["team"]["name"], "Byte Busters")
        self.assertEqual(self.as_student(self.a1).patch(f"/api/v1/my/teams/{self.team_id}/", {"name": "X"}, format="json").status_code, 405)

    def test_submitted_marks_survive_lead_change(self):
        phase = self.make_phase(start=-20, end=-10)
        self.marks(self.x_api, phase, 0)
        self.as_student(self.a1).post(f"/api/v1/my/teams/{self.team_id}/change-lead/", {"student_id": self.b1.id}, format="json")
        self.assertEqual(self.assignment(phase).evaluator_id, self.x.id)  # frozen: already evaluated

    def test_students_never_see_marks(self):
        phase = self.make_phase(start=-20, end=-10)
        self.marks(self.x_api, phase, 0)
        body = self.as_student(self.a1).get("/api/v1/my/projects/").content.decode()
        self.assertNotIn('"marks"', body)
        self.assertNotIn("student_marks", body)


class TeamDeleteCascadeTests(MarksBase):
    """Deleting a team removes everything that belongs to it, and nothing else."""

    def test_admin_delete_removes_all_team_data(self):
        from apps.projects.models import PhaseSubmission, SubmissionLink
        from apps.teams.models import MentorAssignment, Team, TeamInvite, TeamMember
        from apps.evaluations.models import Evaluation

        phase = self.make_phase(start=-1, end=1)
        self.submit_work(phase)
        self.marks(self.x_api, phase, 10)
        self.add_mentor(self.z)
        self.as_student(self.a1).post(f"/api/v1/my/teams/{self.team_id}/request-mentor/", {"faculty_id": self.z.id}, format="json")
        self.as_student(self.a1).post(f"/api/v1/my/teams/{self.team_id}/invite/", {"student_id": self.a3.id}, format="json")
        other_team = self.create_team(self.a2, members=[self.b2])  # must survive

        tables = {
            "members": TeamMember.objects.filter(team_id=self.team_id),
            "invites": TeamInvite.objects.filter(team_id=self.team_id),
            "mentors": MentorAssignment.objects.filter(team_id=self.team_id),
            "submissions": PhaseSubmission.objects.filter(team_id=self.team_id),
            "links": SubmissionLink.objects.filter(submission__team_id=self.team_id),
            "evaluator_assignments": EvaluatorAssignment.objects.filter(team_id=self.team_id),
            "evaluations": Evaluation.objects.filter(assignment__team_id=self.team_id),
            "student_marks": StudentMark.objects.filter(evaluation__assignment__team_id=self.team_id),
        }
        self.assertTrue(all(qs.exists() for qs in tables.values()), {k: qs.count() for k, qs in tables.items()})

        r = self.as_user(self.admin).delete(f"/api/v1/teams/{self.team_id}/")
        self.assertEqual(r.status_code, 204, r.content)
        self.assertFalse(Team.objects.filter(pk=self.team_id).exists())
        self.assertEqual({k: qs.count() for k, qs in tables.items()}, {k: 0 for k in tables})
        self.assertTrue(Team.objects.filter(pk=other_team).exists())
        self.assertTrue(EvaluatorAssignment.objects.filter(team_id=other_team).exists())


class ProgressAndClassTeacherMarksTests(MarksBase):
    def test_student_sees_submission_and_evaluation_progress_without_marks(self):
        phase = self.make_phase(start=-1, end=1, eval_end=10)
        self.submit_work(phase)  # moves the phase 30 days back

        def row():
            data = self.as_student(self.a1).get("/api/v1/my/projects/").json()
            daa = next(s for s in data["subjects"] if s["semester_subject"]["id"] == self.daa.id)
            return daa["phases"][0], data

        r, _ = row()
        self.assertEqual((r["submission_progress"], r["evaluation_progress"]), ("SUBMITTED", "PENDING"))
        phase.refresh_from_db()
        self.assertEqual(r["evaluation_start_date"], str(phase.end_date + timedelta(days=1)))
        self.assertEqual(r["evaluation_end_date"], str(phase.evaluation_end_date))
        self.marks(self.x_api, phase, 12, submit=False)  # a draft isn't "completed"
        self.assertEqual(row()[0]["evaluation_progress"], "PENDING")
        self.marks(self.x_api, phase, 12)
        r, data = row()
        self.assertEqual(r["evaluation_progress"], "COMPLETED")
        self.assertNotIn('"marks"', str(data).replace("'", '"'))

    def test_class_teacher_student_detail_with_marks(self):
        phase = self.make_phase(start=-1, end=1)
        self.submit_work(phase)
        self.marks(self.x_api, phase, 10, students={self.a1: 14})
        # Xavier is class teacher of A; Asha (A1) is in section A
        r = self.x_api.get(f"/api/v1/my/class-sections/{self.a.id}/teams/{self.a1.id}/")
        self.assertEqual(r.status_code, 200, r.content)
        daa = next(s for s in r.json()["subjects"] if s["semester_subject"]["id"] == self.daa.id)
        p = daa["phases"][0]
        self.assertEqual((p["marks"], p["evaluator"]["name"], p["evaluation_progress"]), ("14.00", "Xavier", "COMPLETED"))
        self.assertEqual(daa["team"]["role"], "LEAD")
        self.assertEqual(daa["totals"], {"marks": "14.00", "max_marks": "20.00"})
        dsa = next(s for s in r.json()["subjects"] if s["semester_subject"]["id"] == self.dsa.id)
        self.assertIsNone(dsa["team"])
        # Bina is in section B: not Xavier's class; Yamini isn't A's class teacher
        self.assertEqual(self.x_api.get(f"/api/v1/my/class-sections/{self.a.id}/teams/{self.b1.id}/").status_code, 404)
        self.assertEqual(self.as_faculty(self.y).get(f"/api/v1/my/class-sections/{self.a.id}/teams/{self.a1.id}/").status_code, 404)
