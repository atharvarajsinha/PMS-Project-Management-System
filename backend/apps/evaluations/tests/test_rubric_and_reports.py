"""Phase rubric criteria, member contacts, faculty specializations / profile, and report downloads."""

import io

from apps.accounts.models import Faculty, Specialization
from apps.evaluations.models import CriterionResult
from apps.evaluations.tests.test_evaluations import MarksBase
from apps.imports.tests.test_imports import csv_file
from apps.projects.models import PhaseCriterion


class RubricTests(MarksBase):
    def setUp(self):
        super().setUp()
        self.admin_api = self.as_user(self.admin)

    def make_rubric_phase(self):
        phase = self.make_phase(start=-1, end=1, max_marks="20")
        r = self.admin_api.patch(
            f"/api/v1/phases/{phase.id}/",
            {"criteria": [
                {"name": "Problem statement", "kind": "CHECK"},
                {"name": "Approach", "description": "Is it sound?", "kind": "RATING"},
            ]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        return phase, r.json()["criteria"]

    def test_admin_sets_and_replaces_criteria(self):
        phase, criteria = self.make_rubric_phase()
        self.assertEqual([(c["name"], c["kind"], c["order"]) for c in criteria], [("Problem statement", "CHECK", 1), ("Approach", "RATING", 2)])
        # keep Approach (moved first), drop Problem statement, add Demo
        r = self.admin_api.patch(
            f"/api/v1/phases/{phase.id}/",
            {"criteria": [{"id": criteria[1]["id"], "name": "Approach", "kind": "RATING"}, {"name": "Demo", "kind": "CHECK"}]},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([c["name"] for c in r.json()["criteria"]], ["Approach", "Demo"])
        self.assertEqual(r.json()["criteria"][0]["id"], criteria[1]["id"])
        # duplicate names are rejected
        r = self.admin_api.patch(
            f"/api/v1/phases/{phase.id}/", {"criteria": [{"name": "A"}, {"name": "a"}]}, format="json"
        )
        self.assertError(r, 400, "VALIDATION_ERROR")

    def test_evaluator_records_rubric_and_student_sees_it_after_lock(self):
        phase, criteria = self.make_rubric_phase()
        self.submit_work(phase)
        check, rating = criteria[0]["id"], criteria[1]["id"]
        bad = self.marks(self.x_api, phase, 10, criteria=[{"criterion_id": check, "value": 3}])
        self.assertError(bad, 400, "VALIDATION_ERROR")
        r = self.marks(self.x_api, phase, 10, criteria=[{"criterion_id": check, "value": 1}, {"criterion_id": rating, "value": 4}])
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual([c["name"] for c in body["criteria"]], ["Problem statement", "Approach"])
        self.assertEqual(
            {x["criterion_id"]: x["value"] for x in body["evaluation"]["criteria_results"]}, {check: 1, rating: 4}
        )
        # leaving criteria out keeps them; null clears one
        r = self.marks(self.x_api, phase, 10)
        self.assertEqual(len(r.json()["evaluation"]["criteria_results"]), 2)
        r = self.marks(self.x_api, phase, 10, criteria=[{"criterion_id": rating, "value": None}])
        self.assertEqual(r.json()["evaluation"]["criteria_results"], [{"criterion_id": check, "value": 1}])

        def student_rubric():
            data = self.as_student(self.a1).get("/api/v1/my/projects/").json()
            subject = next(s for s in data["subjects"] if s["semester_subject"]["id"] == self.daa.id)
            return next(p for p in subject["phases"] if p["id"] == phase.id)["criteria"]

        self.assertEqual([(c["name"], c["result"]) for c in student_rubric()], [("Problem statement", None), ("Approach", None)])
        self.admin_api.post(f"/api/v1/phases/{phase.id}/lock/")
        self.assertEqual([c["result"] for c in student_rubric()], [1, None])

    def test_changing_kind_clears_results(self):
        phase, criteria = self.make_rubric_phase()
        self.submit_work(phase)
        self.marks(self.x_api, phase, 10, criteria=[{"criterion_id": criteria[0]["id"], "value": 1}])
        self.admin_api.patch(
            f"/api/v1/phases/{phase.id}/",
            {"criteria": [{"id": criteria[0]["id"], "name": "Problem statement", "kind": "RATING"}]},
            format="json",
        )
        self.assertFalse(CriterionResult.objects.exists())
        self.assertEqual(PhaseCriterion.objects.filter(phase=phase).count(), 1)


class ContactTests(MarksBase):
    def test_team_and_evaluator_see_member_phone(self):
        self.b1.user.phone = "+919800000002"
        self.b1.user.save()
        team = self.as_student(self.a1).get(f"/api/v1/my/teams/{self.team_id}/").json()
        bina = next(m for m in team["members"] if m["id"] == self.b1.id)
        self.assertEqual((bina["email"], bina["phone"]), ("b1@c.edu", "+919800000002"))
        phase = self.make_phase(start=-20, end=-10)
        row = self.x_api.get("/api/v1/my/evaluations/", {"phase_id": phase.id}).json()["results"][0]
        self.assertIn("+919800000002", [m["phone"] for m in row["team"]["members"]])


class FacultyProfileTests(MarksBase):
    def setUp(self):
        super().setUp()
        self.admin_api = self.as_user(self.admin)

    def test_specializations_profile_and_filter(self):
        r = self.admin_api.post("/api/v1/specializations/", {"name": "AI/ML"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        ai = r.json()["id"]
        self.assertError(self.admin_api.post("/api/v1/specializations/", {"name": "ai/ml"}, format="json"), 400, "VALIDATION_ERROR")
        # faculty can read the list but not change it
        x_api = self.as_faculty(self.x)
        self.assertEqual(x_api.get("/api/v1/specializations/").json()["count"], 1)
        self.assertEqual(x_api.post("/api/v1/specializations/", {"name": "IoT"}, format="json").status_code, 403)
        # faculty fills their own profile
        r = x_api.patch(
            "/api/v1/me/faculty-profile/",
            {
                "specialization_ids": [ai], "designation": "Professor", "research_areas": "Vision",
                "publications": [{"title": "Seeing things", "year": 2024, "url": "https://doi.org/x"}],
                "certifications": [{"name": "AWS ML", "issuer": "AWS"}],
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["specializations"], [{"id": ai, "name": "AI/ML"}])
        self.assertEqual(r.json()["publications"][0]["title"], "Seeing things")
        # admin sees it and can filter by it
        rows = self.admin_api.get("/api/v1/faculty/", {"specialization_id": ai}).json()["results"]
        self.assertEqual([f["name"] for f in rows], ["Xavier"])
        self.assertEqual(rows[0]["designation"], "Professor")

    def test_import_specializations_and_faculty(self):
        r = self.admin_api.post("/api/v1/imports/specializations/", {"file": csv_file("name\nAI/ML\nai/ml\nCyber Security\n")}, format="multipart")
        self.assertEqual([row["status"] for row in r.json()["rows"]], ["created", "skipped", "created"])
        text = (
            "name,email,designation,experience_years,specializations\n"
            "Ravi,ravi@c.edu,Professor,12,ai/ml; Cyber Security\n"
            "Meera,meera@c.edu,,x,\n"
            "Nisha,nisha@c.edu,,,Quantum\n"
        )
        r = self.admin_api.post("/api/v1/imports/faculty/", {"file": csv_file(text)}, format="multipart")
        rows = r.json()["rows"]
        self.assertEqual([row["status"] for row in rows], ["created", "error", "error"])
        self.assertIn("experience_years", rows[1]["errors"])
        self.assertIn("Quantum", rows[2]["errors"]["specializations"])
        ravi = Faculty.objects.get(user__email="ravi@c.edu")
        self.assertEqual(sorted(s.name for s in ravi.specializations.all()), ["AI/ML", "Cyber Security"])
        self.assertEqual((ravi.designation, ravi.experience_years), ("Professor", 12))
        self.assertEqual(Specialization.objects.filter(college=self.college).count(), 2)


class ReportTests(MarksBase):
    def setUp(self):
        super().setUp()
        self.admin_api = self.as_user(self.admin)

    def test_reports_list_and_downloads(self):
        kinds = [k["kind"] for k in self.admin_api.get("/api/v1/reports/").json()["results"]]
        self.assertEqual(kinds, ["marks", "students", "faculty", "phases", "rubric"])
        phase = self.make_phase(start=-1, end=1, max_marks="20", name="Proposal")
        self.submit_work(phase)
        self.marks(self.x_api, phase, 15, students={self.b1: "17.5"})

        r = self.admin_api.get("/api/v1/reports/marks/", {"semester_subject_id": self.daa.id})
        self.assertEqual(r.status_code, 200, r.content)
        text = r.content.decode("utf-8-sig")
        self.assertIn("Proposal (/20)", text.splitlines()[0])
        self.assertIn("B1,Bina,B,", text)
        self.assertIn("17.5", text)
        # marks need a subject
        self.assertError(self.admin_api.get("/api/v1/reports/marks/"), 400, "VALIDATION_ERROR")

        for kind in ("students", "faculty", "phases"):
            r = self.admin_api.get(f"/api/v1/reports/{kind}/", {"file_format": "xlsx"})
            self.assertEqual(r.status_code, 200, (kind, r.content[:200]))
            from openpyxl import load_workbook

            ws = load_workbook(io.BytesIO(r.content)).active
            self.assertGreaterEqual(ws.max_row, 2, kind)
        r = self.admin_api.get("/api/v1/reports/rubric/", {"semester_subject_id": self.daa.id})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.as_faculty(self.x).get("/api/v1/reports/").status_code, 403)
