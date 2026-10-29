from django.core import mail

from apps.academics.models import SectionSubject, SemesterSubject, Subject
from apps.accounts.models import Student, User
from apps.common.models import AuditLog
from apps.common.tests.base import PMSTestCase


class Fixture(PMSTestCase):
    """Sem 7: sections A, B. DAA → A (Xavier), B (Yamini). DSA → A (Xavier). Xavier is class teacher of A."""

    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.admin = self.make_admin(self.college)
        self.sem = self.make_semester(self.college, 7)
        self.a, self.b = self.make_section(self.sem, "A"), self.make_section(self.sem, "B")
        self.x = self.make_faculty(self.college, name="Xavier Rao", email="x@c.edu")
        self.y = self.make_faculty(self.college, name="Yamini Shah", email="y@c.edu")
        self.a.class_teacher = self.x
        self.a.save()
        daa = Subject.objects.create(college=self.college, code="DAA", name="Design & Analysis of Algorithms")
        dsa = Subject.objects.create(college=self.college, code="DSA", name="Data Structures")
        self.daa = SemesterSubject.objects.create(semester=self.sem, subject=daa)
        self.dsa = SemesterSubject.objects.create(semester=self.sem, subject=dsa)
        self.daa_a = SectionSubject.objects.create(section=self.a, semester_subject=self.daa, faculty=self.x)
        self.daa_b = SectionSubject.objects.create(section=self.b, semester_subject=self.daa, faculty=self.y)
        self.dsa_a = SectionSubject.objects.create(section=self.a, semester_subject=self.dsa, faculty=self.x)
        self.s1 = self.make_student(self.a, roll="A1", name="Asha", email="asha@c.edu")
        self.s2 = self.make_student(self.a, roll="A2", name="Arjun", email="arjun@c.edu", active=False)
        self.s3 = self.make_student(self.b, roll="B1", name="Bina", email="bina@c.edu")


class MappingSearchTests(Fixture):
    def setUp(self):
        super().setUp()
        self.client = self.client_for(self.admin)

    def test_search_section_subjects(self):
        get = lambda q: self.client.get("/api/v1/section-subjects/", {"search": q}).json()["count"]
        self.assertEqual(get("daa"), 2)  # subject code
        self.assertEqual(get("structures"), 1)  # subject name
        self.assertEqual(get("yamini"), 1)  # faculty name
        self.assertEqual(get("x@c.edu"), 2)  # faculty email
        self.assertEqual(get("7"), 3)  # semester number
        self.assertEqual(get("nothing"), 0)

    def test_search_semester_subjects(self):
        get = lambda q: [r["subject"]["code"] for r in self.client.get("/api/v1/semester-subjects/", {"search": q}).json()["results"]]
        self.assertEqual(get("dsa"), ["DSA"])
        self.assertEqual(get("algorithms"), ["DAA"])
        self.assertEqual(get("yamini"), ["DAA"])  # via mapped section's faculty
        self.assertEqual(get("A"), ["DAA", "DSA"])  # no duplicates from joins


class AdminDashboardTests(Fixture):
    def test_college_includes_stats_for_admin(self):
        body = self.client_for(self.admin).get("/api/v1/college/").json()
        self.assertEqual(body["stats"], {"faculty": 2, "students": 3, "semesters": 1})

    def test_college_hides_stats_from_faculty(self):
        self.assertNotIn("stats", self.client_for(self.x.user).get("/api/v1/college/").json())

    def test_dashboard(self):
        SectionSubject.objects.filter(pk=self.dsa_a.pk).update(faculty=None)
        body = self.client_for(self.admin).get("/api/v1/dashboard/").json()
        self.assertEqual(
            body["counts"],
            {"faculty": 2, "students": 3, "semesters": 1, "subjects": 2, "sections": 2,
             "semester_subjects": 2, "section_subjects": 3},
        )
        self.assertEqual(
            body["pending"],
            {"inactive_faculty": 0, "inactive_students": 1, "sections_without_class_teacher": 1,
             "section_subjects_without_faculty": 1},
        )
        self.assertEqual(body["semesters"], [{"id": self.sem.id, "semester_number": 7, "sections": 2, "subjects": 2, "students": 3}])

    def test_dashboard_is_admin_only(self):
        self.assertError(self.client_for(self.x.user).get("/api/v1/dashboard/"), 403, "PERMISSION_DENIED")


class FacultyPortalTests(Fixture):
    def setUp(self):
        super().setUp()
        self.client = self.client_for(self.x.user)

    def test_faculty_dashboard(self):
        body = self.client.get("/api/v1/my/dashboard/").json()
        self.assertEqual(
            body["counts"],
            {"class_sections": 1, "class_students": 2, "class_students_inactive": 1,
             "teaching_assignments": 2, "teaching_subjects": 2, "teaching_students": 4},
        )
        self.assertEqual(body["class_sections"][0]["section_name"], "A")
        self.assertEqual([t["subject_code"] for t in body["teaching"]], ["DAA", "DSA"])

    def test_dashboard_is_faculty_only(self):
        self.assertError(self.client_for(self.admin).get("/api/v1/my/dashboard/"), 403, "PERMISSION_DENIED")

    def test_teaching_views(self):
        teaching = self.client.get("/api/v1/my/teaching/").json()
        self.assertEqual(teaching["count"], 2)
        first = teaching["results"][0]
        self.assertEqual((first["subject"]["code"], first["section"]["name"], first["students_count"]), ("DAA", "A", 2))
        self.assertEqual(first["class_teacher"]["name"], "Xavier Rao")

        students = self.client.get(f"/api/v1/my/teaching/{self.daa_a.id}/students/").json()
        self.assertEqual([s["roll_number"] for s in students["results"]], ["A1", "A2"])
        r = self.client.get(f"/api/v1/my/teaching/{self.daa_a.id}/students/", {"search": "arj", "status": "INACTIVE"})
        self.assertEqual(r.json()["count"], 1)

        # Faculty Y's assignment is not visible to X
        self.assertError(self.client.get(f"/api/v1/my/teaching/{self.daa_b.id}/"), 404, "NOT_FOUND")
        self.assertError(self.client.get(f"/api/v1/my/teaching/{self.daa_b.id}/students/"), 404, "NOT_FOUND")

    def test_class_sections(self):
        body = self.client.get("/api/v1/my/class-sections/").json()
        self.assertEqual(body["count"], 1)
        self.assertEqual((body["results"][0]["name"], body["results"][0]["students_count"]), ("A", 2))
        self.assertError(self.client.get(f"/api/v1/my/class-sections/{self.b.id}/"), 404, "NOT_FOUND")

    def test_class_teacher_manages_students(self):
        base = f"/api/v1/my/class-sections/{self.a.id}/students/"
        self.assertEqual(self.client.get(base).json()["count"], 2)

        r = self.client.post(base, {"name": "Neha", "email": "neha@c.edu", "roll_number": "A3"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["section"]["name"], "A")
        self.assertEqual(Student.objects.get(roll_number="A3").section, self.a)

        # section can't be changed by the class teacher (field is not accepted)
        r = self.client.patch(f"{base}{self.s1.id}/", {"phone": "9876543210", "section_id": self.b.id}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.s1.refresh_from_db()
        self.assertEqual((self.s1.section, self.s1.user.phone), (self.a, "9876543210"))

        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(f"{base}{self.s2.id}/activate/")
        self.assertEqual(r.json()["status"], "ACTIVE")
        self.assertEqual(mail.outbox[-1].to, ["arjun@c.edu"])
        log = AuditLog.objects.filter(action="student.activate").latest("created_at")
        self.assertEqual((log.actor_id, log.actor_role), (self.x.user_id, "FACULTY"))

        r = self.client.post(f"{base}bulk-deactivate/", {"ids": [self.s1.id, self.s3.id]}, format="json")
        self.assertEqual(r.json()["succeeded"], [self.s1.id])
        self.assertEqual(r.json()["failed"][0]["code"], "NOT_FOUND")  # other section's student

        self.assertEqual(self.client.delete(f"{base}{self.s1.id}/").status_code, 405)

    def test_cannot_manage_other_sections(self):
        base = f"/api/v1/my/class-sections/{self.b.id}/students/"
        self.assertError(self.client.get(base), 404, "NOT_FOUND")
        self.assertError(self.client.post(base, {"name": "N", "email": "n@c.edu", "roll_number": "Z"}, format="json"), 404, "NOT_FOUND")
        self.assertError(
            self.client.patch(f"/api/v1/my/class-sections/{self.a.id}/students/{self.s3.id}/", {"name": "Hack"}, format="json"),
            404,
            "NOT_FOUND",
        )

    def test_student_cannot_use_portal(self):
        client = self.client_for(self.s1.user)
        self.assertError(client.get("/api/v1/my/teaching/"), 403, "PERMISSION_DENIED")
