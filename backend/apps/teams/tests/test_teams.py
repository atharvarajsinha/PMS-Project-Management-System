from django.db import IntegrityError, transaction

from apps.evaluations.models import EvaluatorAssignment
from apps.teams.models import MentorAssignment, Team, TeamMember

from .fixture import Phase2Fixture


class TeamFormationTests(Phase2Fixture):
    def test_create_invite_accept(self):
        team_id = self.create_team(self.a1, members=[self.b1])
        team = Team.objects.get(pk=team_id)
        self.assertEqual(team.lead_id, self.a1.id)
        self.assertEqual(set(team.members.values_list("student_id", flat=True)), {self.a1.id, self.b1.id})
        data = self.as_student(self.a1).get(f"/api/v1/my/teams/{team_id}/").json()
        self.assertTrue(data["is_complete"])
        self.assertEqual([m["role"] for m in data["members"]], ["LEAD", "MEMBER"])

    def test_formation_off_blocks_students(self):
        self.settings.team_formation_enabled = False
        self.settings.save()
        r = self.as_student(self.a1).post("/api/v1/my/teams/", {"semester_subject_id": self.daa.id}, format="json")
        self.assertError(r, 409, "CONFLICT")

    def test_ineligible_section(self):
        # DSA is mapped to section A only
        r = self.as_student(self.b1).post("/api/v1/my/teams/", {"semester_subject_id": self.dsa.id}, format="json")
        self.assertError(r, 409, "CONFLICT")
        team_id = self.create_team(self.a1, offering=self.dsa)
        r = self.as_student(self.a1).post(f"/api/v1/my/teams/{team_id}/invite/", {"student_id": self.b1.id}, format="json")
        self.assertError(r, 409, "CONFLICT")

    def test_one_team_per_subject_but_many_subjects(self):
        self.create_team(self.a1)
        r = self.as_student(self.a1).post("/api/v1/my/teams/", {"semester_subject_id": self.daa.id}, format="json")
        self.assertError(r, 409, "CONFLICT")
        self.create_team(self.a1, offering=self.dsa)  # a DSA team is fine
        self.assertEqual(TeamMember.objects.filter(student=self.a1).count(), 2)

    def test_db_enforces_one_team_per_subject(self):
        t1 = Team.objects.get(pk=self.create_team(self.a1))
        t2 = Team.objects.get(pk=self.create_team(self.a2))
        with self.assertRaises(IntegrityError), transaction.atomic():
            TeamMember.objects.create(team=t2, student=self.a1, semester_subject=t1.semester_subject)

    def test_max_size(self):
        team_id = self.create_team(self.a1, members=[self.a2, self.a3])  # max 3
        r = self.as_student(self.a1).post(f"/api/v1/my/teams/{team_id}/invite/", {"student_id": self.b1.id}, format="json")
        self.assertError(r, 409, "CONFLICT")

    def test_accepting_one_invite_cancels_the_others(self):
        t1 = self.as_student(self.a1).post("/api/v1/my/teams/", {"semester_subject_id": self.daa.id}, format="json").json()["id"]
        t2 = self.as_student(self.a2).post("/api/v1/my/teams/", {"semester_subject_id": self.daa.id}, format="json").json()["id"]
        self.as_student(self.a1).post(f"/api/v1/my/teams/{t1}/invite/", {"student_id": self.b1.id}, format="json")
        self.as_student(self.a2).post(f"/api/v1/my/teams/{t2}/invite/", {"student_id": self.b1.id}, format="json")
        b1 = self.as_student(self.b1)
        invites = b1.get("/api/v1/my/invites/").json()["results"]
        self.assertEqual(len(invites), 2)
        first = next(i for i in invites if i["team_id"] == t1)
        self.assertEqual(b1.post(f"/api/v1/my/invites/{first['id']}/accept/").status_code, 204)
        self.assertEqual(b1.get("/api/v1/my/invites/").json()["count"], 0)

    def test_invite_history_for_lead(self):
        lead = self.as_student(self.a1)
        t1 = lead.post("/api/v1/my/teams/", {"semester_subject_id": self.daa.id}, format="json").json()["id"]
        t2 = self.as_student(self.a2).post("/api/v1/my/teams/", {"semester_subject_id": self.daa.id}, format="json").json()["id"]
        for student in (self.b1, self.b2, self.a3):
            lead.post(f"/api/v1/my/teams/{t1}/invite/", {"student_id": student.id}, format="json")
        self.as_student(self.a2).post(f"/api/v1/my/teams/{t2}/invite/", {"student_id": self.a3.id}, format="json")

        def respond(student, team_id, verb):
            invite = next(i for i in self.as_student(student).get("/api/v1/my/invites/").json()["results"] if i["team_id"] == team_id)
            self.as_student(student).post(f"/api/v1/my/invites/{invite['id']}/{verb}/")

        respond(self.b1, t1, "accept")
        respond(self.b2, t1, "decline")
        respond(self.a3, t2, "accept")  # joins the other team → our invite is cancelled automatically
        rows = {r["student"]["id"]: r for r in lead.get(f"/api/v1/my/teams/{t1}/invite-history/").json()}
        self.assertEqual(
            {sid: (r["status"], r["is_automatic"]) for sid, r in rows.items()},
            {self.b1.id: ("ACCEPTED", False), self.b2.id: ("DECLINED", False), self.a3.id: ("CANCELLED", True)},
        )
        self.assertIsNotNone(rows[self.b1.id]["responded_at"])
        # only the Team Lead sees it
        self.assertEqual(self.as_student(self.b1).get(f"/api/v1/my/teams/{t1}/invite-history/").status_code, 403)

    def test_only_lead_manages(self):
        team_id = self.create_team(self.a1, members=[self.a2])
        r = self.as_student(self.a2).post(f"/api/v1/my/teams/{team_id}/invite/", {"student_id": self.a3.id}, format="json")
        self.assertError(r, 403, "PERMISSION_DENIED")
        # outsiders can't even see it
        self.assertEqual(self.as_student(self.a3).get(f"/api/v1/my/teams/{team_id}/").status_code, 404)

    def test_leave_and_lead_rules(self):
        team_id = self.create_team(self.a1, members=[self.a2])
        lead = self.as_student(self.a1)
        self.assertError(lead.post(f"/api/v1/my/teams/{team_id}/leave/"), 409, "CONFLICT")
        self.assertEqual(self.as_student(self.a2).post(f"/api/v1/my/teams/{team_id}/leave/").status_code, 204)
        self.assertFalse(TeamMember.objects.filter(student=self.a2).exists())

    def test_lock_freezes_students_but_not_admin(self):
        team_id = self.create_team(self.a1, members=[self.a2])
        self.settings.teams_locked = True
        self.settings.save()
        self.assertError(self.as_student(self.a2).post(f"/api/v1/my/teams/{team_id}/leave/"), 409, "CONFLICT")
        admin = self.as_user(self.admin)
        r = admin.post(f"/api/v1/teams/{team_id}/add-member/", {"student_id": self.b1.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        r = admin.post(f"/api/v1/teams/{team_id}/remove-member/", {"student_id": self.a2.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["members_count"], 2)

    def test_team_lead_cannot_be_deleted(self):
        self.create_team(self.a1, members=[self.a2])
        admin = self.as_user(self.admin)
        self.assertError(admin.delete(f"/api/v1/students/{self.a1.id}/"), 409, "HAS_DEPENDENTS")
        self.assertEqual(admin.delete(f"/api/v1/students/{self.a2.id}/").status_code, 204)

    def test_student_cannot_move_to_section_without_the_subject(self):
        self.create_team(self.a1, offering=self.dsa)  # DSA only in A
        r = self.as_user(self.admin).patch(f"/api/v1/students/{self.a1.id}/", {"section_id": self.b.id}, format="json")
        self.assertError(r, 409, "CONFLICT")

    def test_admin_list_filters(self):
        self.create_team(self.a1, members=[self.b1])
        self.create_team(self.a2)  # incomplete (1 < min 2)
        admin = self.as_user(self.admin)
        self.assertEqual(admin.get("/api/v1/teams/", {"incomplete": "true"}).json()["count"], 1)
        self.assertEqual(admin.get("/api/v1/teams/", {"section_id": self.b.id}).json()["count"], 1)
        r = admin.get("/api/v1/teams/unassigned-students/", {"semester_subject_id": self.daa.id}).json()
        self.assertEqual({s["id"] for s in r["results"]}, {self.a3.id, self.b2.id})

    def test_admin_create_team_and_rename_unique(self):
        admin = self.as_user(self.admin)
        r = admin.post("/api/v1/teams/", {"semester_subject_id": self.daa.id, "lead_id": self.a1.id, "member_ids": [self.b1.id]}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        t1 = r.json()["id"]
        t2 = admin.post("/api/v1/teams/", {"semester_subject_id": self.daa.id, "lead_id": self.a2.id}, format="json").json()["id"]
        self.assertEqual(admin.patch(f"/api/v1/teams/{t1}/", {"name": "Alpha"}, format="json").status_code, 200)
        self.assertError(admin.patch(f"/api/v1/teams/{t2}/", {"name": "alpha"}, format="json"), 400, "VALIDATION_ERROR")


class EvaluatorAutoAssignTests(Phase2Fixture):
    def evaluators(self, team_id):
        return list(EvaluatorAssignment.objects.filter(team_id=team_id).values_list("evaluator_id", flat=True))

    def test_default_follows_team_lead_section(self):
        self.make_phase()
        team_id = self.create_team(self.a1, members=[self.b1])
        self.assertEqual(self.evaluators(team_id), [self.x.id])
        # new phase → assignment for existing team
        self.make_phase(start=10, end=20)
        self.assertEqual(self.evaluators(team_id), [self.x.id, self.x.id])
        # lead moves to B student → Yamini (before lock)
        r = self.as_student(self.a1).post(f"/api/v1/my/teams/{team_id}/change-lead/", {"student_id": self.b1.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.evaluators(team_id), [self.y.id, self.y.id])

    def test_no_recalc_after_lock(self):
        self.make_phase()
        team_id = self.create_team(self.a1, members=[self.b1])
        self.settings.teams_locked = True
        self.settings.save()
        r = self.as_user(self.admin).post(f"/api/v1/teams/{team_id}/change-lead/", {"student_id": self.b1.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.evaluators(team_id), [self.x.id])

    def test_evaluator_pending_then_faculty_assigned(self):
        self.daa_a.faculty = None
        self.daa_a.save()
        self.make_phase()
        team_id = self.create_team(self.a1, members=[self.a2])
        admin = self.as_user(self.admin)
        self.assertTrue(admin.get(f"/api/v1/teams/{team_id}/").json()["evaluator_pending"])
        self.assertEqual(admin.get("/api/v1/teams/", {"evaluator_pending": "true"}).json()["count"], 1)
        r = admin.patch(f"/api/v1/section-subjects/{self.daa_a.id}/", {"faculty_id": self.z.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.evaluators(team_id), [self.z.id])

    def test_override_respects_cross_section_setting(self):
        phase = self.make_phase()
        team_id = self.create_team(self.a1, members=[self.a2])  # all in A; only Xavier teaches DAA there
        admin = self.as_user(self.admin)
        r = admin.post(f"/api/v1/teams/{team_id}/set-evaluator/", {"evaluator_id": self.y.id}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.settings.allow_cross_section_evaluation = True
        self.settings.save()
        r = admin.post(f"/api/v1/teams/{team_id}/set-evaluator/", {"evaluator_id": self.y.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        a = EvaluatorAssignment.objects.get(team_id=team_id, phase=phase)
        self.assertEqual((a.evaluator_id, a.source), (self.y.id, "ADMIN_OVERRIDE"))
        # an override survives a lead change; reset goes back to automatic
        r = admin.post(f"/api/v1/teams/{team_id}/set-evaluator/", {"evaluator_id": None}, format="json")
        a.refresh_from_db()
        self.assertEqual((a.evaluator_id, a.source), (self.x.id, "AUTO"))


class MentorTests(Phase2Fixture):
    def setUp(self):
        super().setUp()
        self.slot = self.add_mentor(self.z, capacity=1)
        self.t1 = self.create_team(self.a1, members=[self.a2])
        self.t2 = self.create_team(self.b1, members=[self.b2])

    def request(self, lead, team_id, faculty):
        return self.as_student(lead).post(f"/api/v1/my/teams/{team_id}/request-mentor/", {"faculty_id": faculty.id}, format="json")

    def decide(self, faculty, team_id, accept=True):
        api = self.as_faculty(faculty)
        row = next(r for r in api.get("/api/v1/my/mentoring/").json()["results"] if r["team"]["id"] == team_id)
        return api.post(f"/api/v1/my/mentoring/{row['id']}/{'accept' if accept else 'reject'}/")

    def test_many_requests_then_full_auto_rejects_the_rest(self):
        # capacity 1: both teams may ask; pending requests don't use the slot
        self.assertEqual(self.request(self.a1, self.t1, self.z).status_code, 200)
        self.assertEqual(self.request(self.b1, self.t2, self.z).status_code, 200)
        self.assertEqual(self.decide(self.z, self.t2).json()["status"], "ACCEPTED")
        other = MentorAssignment.objects.get(team_id=self.t1, faculty=self.z)
        self.assertEqual((other.status, other.is_automatic), ("REJECTED", True))
        # full now: new requests are refused, and students only see "available: false" (no counts)
        t3 = self.create_team(self.a3, members=[self.a2], offering=self.dsa)
        self.assertError(self.request(self.a3, t3, self.z), 409, "CONFLICT")
        mentors = self.as_student(self.b1).get(f"/api/v1/my/teams/{self.t2}/mentors/").json()
        self.assertEqual(
            mentors, [{"faculty": mentors[0]["faculty"], "specializations": [], "designation": "", "available": False}]
        )

    def test_histories(self):
        self.request(self.a1, self.t1, self.z)
        self.request(self.b1, self.t2, self.z)
        self.decide(self.z, self.t1, accept=False)
        history = self.as_faculty(self.z).get("/api/v1/my/mentoring/history/").json()["results"]
        self.assertEqual([(h["team"]["id"], h["status"]) for h in history], [(self.t1, "REJECTED")])
        self.decide(self.z, self.t2)
        statuses = {h["team"]["id"]: h["status"] for h in self.as_faculty(self.z).get("/api/v1/my/mentoring/history/").json()["results"]}
        self.assertEqual(statuses, {self.t1: "REJECTED", self.t2: "ACCEPTED"})
        # the Team Lead sees every request of their team; other members can't
        lead = self.as_student(self.a1).get(f"/api/v1/my/teams/{self.t1}/mentor-requests/")
        self.assertEqual([r["status"] for r in lead.json()], ["REJECTED"])
        self.assertEqual(self.as_student(self.a2).get(f"/api/v1/my/teams/{self.t1}/mentor-requests/").status_code, 403)

    def test_reject_frees_slot_and_team_can_choose_again(self):
        self.request(self.a1, self.t1, self.z)
        z = self.as_faculty(self.z)
        pending = z.get("/api/v1/my/mentoring/").json()["results"]
        self.assertEqual(pending[0]["status"], "PENDING")
        r = z.post(f"/api/v1/my/mentoring/{pending[0]['id']}/reject/", {"note": "Full"}, format="json")
        self.assertEqual(r.json()["status"], "REJECTED")
        self.assertEqual(self.request(self.b1, self.t2, self.z).status_code, 200)

    def test_accept(self):
        self.request(self.a1, self.t1, self.z)
        z = self.as_faculty(self.z)
        mid = z.get("/api/v1/my/mentoring/").json()["results"][0]["id"]
        self.assertEqual(z.post(f"/api/v1/my/mentoring/{mid}/accept/").json()["status"], "ACCEPTED")
        self.assertEqual(self.as_user(self.admin).get("/api/v1/teams/", {"has_mentor": "true"}).json()["count"], 1)

    def test_not_on_list_or_incomplete(self):
        self.assertError(self.request(self.a1, self.t1, self.x), 409, "CONFLICT")
        t3 = self.create_team(self.a3)  # alone → incomplete
        self.assertError(self.request(self.a3, t3, self.z), 409, "CONFLICT")

    def test_one_active_request_and_cancel(self):
        self.add_mentor(self.y, capacity=3)
        self.request(self.a1, self.t1, self.z)
        self.assertError(self.request(self.a1, self.t1, self.y), 409, "CONFLICT")
        self.as_student(self.a1).post(f"/api/v1/my/teams/{self.t1}/cancel-mentor-request/")
        self.assertEqual(self.request(self.a1, self.t1, self.y).status_code, 200)

    def test_admin_assign_replace_and_override_capacity(self):
        self.add_mentor(self.y, capacity=1)
        self.request(self.a1, self.t1, self.z)
        admin = self.as_user(self.admin)
        r = admin.post(f"/api/v1/teams/{self.t1}/assign-mentor/", {"faculty_id": self.y.id}, format="json")
        self.assertEqual([m["faculty"]["id"] for m in r.json()["mentors"]], [self.y.id])
        self.assertEqual(MentorAssignment.objects.get(team_id=self.t1, faculty=self.z).status, "REMOVED")
        # Yamini is now full; admin may still add her elsewhere with override_capacity
        r = admin.post(f"/api/v1/teams/{self.t2}/assign-mentor/", {"faculty_id": self.y.id}, format="json")
        self.assertError(r, 409, "CONFLICT")
        r = admin.post(f"/api/v1/teams/{self.t2}/assign-mentor/", {"faculty_id": self.y.id, "override_capacity": True}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        # extra mentor without replacing (special case)
        r = admin.post(f"/api/v1/teams/{self.t2}/assign-mentor/", {"faculty_id": self.z.id, "replace": False}, format="json")
        self.assertEqual(len(r.json()["mentors"]), 2)

    def test_mentor_list_admin(self):
        admin = self.as_user(self.admin)
        r = admin.post("/api/v1/semester-mentors/", {"semester_id": self.sem.id, "faculty_ids": [self.x.id, self.z.id]}, format="json")
        self.assertEqual(len(r.json()["created"]), 1)  # Zoya already listed
        self.assertEqual(r.json()["created"][0]["capacity"], self.settings.default_mentor_capacity)
        self.request(self.a1, self.t1, self.z)
        rows = admin.get("/api/v1/semester-mentors/", {"semester_id": self.sem.id}).json()["results"]
        zoya = next(row for row in rows if row["faculty"]["id"] == self.z.id)
        self.assertEqual((zoya["load"], zoya["pending"], zoya["free"]), (0, 1, 1))  # pending doesn't use the slot
        self.decide(self.z, self.t1)
        zoya = next(r for r in admin.get("/api/v1/semester-mentors/", {"semester_id": self.sem.id}).json()["results"] if r["faculty"]["id"] == self.z.id)
        self.assertEqual((zoya["load"], zoya["free"]), (1, 0))
        self.assertError(admin.delete(f"/api/v1/semester-mentors/{self.slot.id}/"), 409, "HAS_DEPENDENTS")
        self.assertError(admin.patch(f"/api/v1/semester-mentors/{self.slot.id}/", {"capacity": 0}, format="json"), 400, "VALIDATION_ERROR")


class ClassTeacherViewTests(Phase2Fixture):
    def test_class_teacher_sees_students_teams_and_evaluators(self):
        self.make_phase()
        self.add_mentor(self.z)
        team_id = self.create_team(self.a1, members=[self.b1])
        self.as_student(self.a1).post(f"/api/v1/my/teams/{team_id}/request-mentor/", {"faculty_id": self.z.id}, format="json")
        r = self.as_faculty(self.x).get(f"/api/v1/my/class-sections/{self.a.id}/teams/")
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual([s["subject"]["code"] for s in data["subjects"]], ["DAA", "DSA"])
        asha = next(row for row in data["students"] if row["student"]["id"] == self.a1.id)
        cell = asha["teams"][str(self.daa.id)]
        self.assertEqual(cell["role"], "LEAD")
        self.assertEqual(cell["evaluators"][0]["evaluator"]["name"], "Xavier")
        self.assertEqual(cell["mentors"][0]["status"], "PENDING")
        self.assertIsNone(asha["teams"][str(self.dsa.id)])
        aman = next(row for row in data["students"] if row["student"]["id"] == self.a3.id)
        self.assertIsNone(aman["teams"][str(self.daa.id)])
        self.assertNotIn("marks", r.content.decode())

    def test_other_faculty_cannot_see(self):
        self.assertEqual(self.as_faculty(self.y).get(f"/api/v1/my/class-sections/{self.a.id}/teams/").status_code, 404)
