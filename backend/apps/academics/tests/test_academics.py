from apps.academics.models import Section, SectionSubject
from apps.accounts.models import User
from apps.common.models import EmailOutbox
from apps.common.tests.base import PMSTestCase


class AcademicSetupTests(PMSTestCase):
    """Walks through the Sem 7 example from the PRD: DAA → A, C, D."""

    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.admin = self.make_admin(self.college)
        self.client = self.client_for(self.admin)

    def post(self, url, data):
        return self.client.post(url, data, format="json")

    def test_full_structure(self):
        sem = self.post("/api/v1/semesters/", {"semester_number": 7}).json()
        self.assertError(self.post("/api/v1/semesters/", {"semester_number": 7}), 409, "CONFLICT")
        self.assertError(self.post("/api/v1/semesters/", {"semester_number": 13}), 400, "VALIDATION_ERROR")

        daa = self.post("/api/v1/subjects/", {"code": "daa", "name": "Design & Analysis of Algorithms"}).json()
        self.assertEqual(daa["code"], "DAA")
        self.assertError(self.post("/api/v1/subjects/", {"code": "DAA", "name": "x"}), 409, "CONFLICT")

        sections = {
            name: self.post("/api/v1/sections/", {"semester_id": sem["id"], "name": name.lower()}).json()
            for name in "ACDB"
        }
        self.assertEqual(sections["A"]["name"], "A")
        self.assertError(self.post("/api/v1/sections/", {"semester_id": sem["id"], "name": "A"}), 409, "CONFLICT")

        x = self.make_faculty(self.college, name="Faculty X")
        y = self.make_faculty(self.college, name="Faculty Y")

        offering = self.post("/api/v1/semester-subjects/", {"semester_id": sem["id"], "subject_id": daa["id"]}).json()
        self.assertError(
            self.post("/api/v1/semester-subjects/", {"semester_id": sem["id"], "subject_id": daa["id"]}), 409, "CONFLICT"
        )

        r = self.post(
            "/api/v1/section-subjects/bulk/",
            {
                "semester_subject_id": offering["id"],
                "items": [
                    {"section_id": sections["A"]["id"], "faculty_id": str(x.id)},
                    {"section_id": sections["C"]["id"], "faculty_id": str(y.id)},
                    {"section_id": sections["D"]["id"]},
                    {"section_id": sections["A"]["id"]},  # duplicate
                    {"section_id": 999999},
                ],
            },
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.json()["created"]), 3)
        self.assertEqual([f["code"] for f in r.json()["failed"]], ["CONFLICT", "VALIDATION_ERROR"])

        detail = self.client.get(f"/api/v1/semester-subjects/{offering['id']}/").json()
        self.assertEqual([s["section_name"] for s in detail["sections"]], ["A", "C", "D"])

        unassigned = self.client.get(f"/api/v1/section-subjects/?semester_id={sem['id']}&unassigned=true").json()
        self.assertEqual(unassigned["count"], 1)
        mapping_id = unassigned["results"][0]["id"]
        r = self.client.patch(f"/api/v1/section-subjects/{mapping_id}/", {"faculty_id": str(x.id)}, format="json")
        self.assertEqual(r.json()["faculty"]["name"], "Faculty X")
        self.assertIsNotNone(r.json()["faculty_assigned_at"])

        fac = self.client.get(f"/api/v1/faculty/{x.id}/").json()
        self.assertEqual(fac["teaching_count"], 2)
        self.assertEqual({t["section_name"] for t in fac["teaching"]}, {"A", "D"})

        subjects = self.client.get(f"/api/v1/subjects/?semester_id={sem['id']}").json()
        self.assertEqual(subjects["results"][0]["offered_in"], [7])

        section_a = self.client.get(f"/api/v1/sections/{sections['A']['id']}/").json()
        self.assertEqual(section_a["subjects"][0]["subject_code"], "DAA")

    def test_mapping_rejects_section_from_other_semester(self):
        s7, s8 = self.make_semester(self.college, 7), self.make_semester(self.college, 8)
        section8 = self.make_section(s8)
        offering7 = self.post(
            "/api/v1/semester-subjects/",
            {"semester_id": str(s7.id), "subject_id": self.post("/api/v1/subjects/", {"code": "AI", "name": "AI"}).json()["id"]},
        ).json()
        r = self.post(
            "/api/v1/section-subjects/", {"section_id": str(section8.id), "semester_subject_id": offering7["id"]}
        )
        self.assertError(r, 400, "VALIDATION_ERROR")

    def test_class_teacher_rules(self):
        s7, s5 = self.make_semester(self.college, 7), self.make_semester(self.college, 5)
        a7, b7, c5 = self.make_section(s7, "A"), self.make_section(s7, "B"), self.make_section(s5, "C")
        x = self.make_faculty(self.college, name="Faculty X")

        r = self.client.put(f"/api/v1/sections/{a7.id}/class-teacher/", {"faculty_id": str(x.id)}, format="json")
        self.assertEqual(r.json()["class_teacher"]["name"], "Faculty X")
        # same semester, other section → conflict
        r = self.client.put(f"/api/v1/sections/{b7.id}/class-teacher/", {"faculty_id": str(x.id)}, format="json")
        self.assertError(r, 409, "CONFLICT")
        self.assertIn("section A", r.json()["error"]["message"])
        # different semester → fine
        r = self.client.put(f"/api/v1/sections/{c5.id}/class-teacher/", {"faculty_id": str(x.id)}, format="json")
        self.assertEqual(r.status_code, 200)

        fac = self.client.get(f"/api/v1/faculty/{x.id}/").json()
        self.assertEqual(len(fac["class_teacher_of"]), 2)
        self.assertEqual(self.client.get("/api/v1/sections/?has_class_teacher=false").json()["count"], 1)

        r = self.client.delete(f"/api/v1/sections/{a7.id}/class-teacher/")
        self.assertIsNone(r.json()["class_teacher"])

    def test_delete_rules(self):
        sem = self.make_semester(self.college)
        section = self.make_section(sem)
        self.make_student(section)
        self.assertError(self.client.delete(f"/api/v1/sections/{section.id}/"), 409, "HAS_DEPENDENTS")
        self.assertError(self.client.delete(f"/api/v1/semesters/{sem.id}/"), 409, "HAS_DEPENDENTS")
        self.assertTrue(Section.objects.filter(pk=section.pk).exists())

        empty = self.make_section(sem, "Z")
        self.assertEqual(self.client.delete(f"/api/v1/sections/{empty.id}/").status_code, 204)

    def test_deleting_faculty_unassigns_but_keeps_structure(self):
        sem = self.make_semester(self.college)
        section = self.make_section(sem)
        x = self.make_faculty(self.college)
        section.class_teacher = x
        section.save()
        subj = self.post("/api/v1/subjects/", {"code": "DSA", "name": "DSA"}).json()
        offering = self.post("/api/v1/semester-subjects/", {"semester_id": str(sem.id), "subject_id": subj["id"]}).json()
        mapping = self.post(
            "/api/v1/section-subjects/",
            {"section_id": str(section.id), "semester_subject_id": offering["id"], "faculty_id": str(x.id)},
        ).json()

        self.assertEqual(self.client.delete(f"/api/v1/faculty/{x.id}/").status_code, 204)
        section.refresh_from_db()
        self.assertIsNone(section.class_teacher)
        self.assertIsNone(SectionSubject.objects.get(pk=mapping["id"]).faculty)
        self.assertFalse(User.objects.filter(pk=x.user_id).exists())


class TenantIsolationTests(PMSTestCase):
    def test_admin_cannot_see_or_use_other_college_data(self):
        a, b = self.make_college("AAA"), self.make_college("BBB")
        section_a = self.make_section(self.make_semester(a))
        faculty_a = self.make_faculty(a)
        client_b = self.client_for(self.make_admin(b))

        self.assertError(client_b.get(f"/api/v1/sections/{section_a.id}/"), 404, "NOT_FOUND")
        self.assertError(client_b.get(f"/api/v1/faculty/{faculty_a.id}/"), 404, "NOT_FOUND")
        self.assertEqual(client_b.get("/api/v1/sections/").json()["count"], 0)

        r = client_b.post(
            "/api/v1/students/",
            {"name": "S", "email": "s@b.edu", "roll_number": "R1", "section_id": str(section_a.id)},
            format="json",
        )
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.assertIn("section_id", r.json()["error"]["details"])

    def test_faculty_and_students_cannot_manage(self):
        college = self.make_college()
        faculty = self.make_faculty(college)
        client = self.client_for(faculty.user)
        self.assertError(client.get("/api/v1/students/"), 403, "PERMISSION_DENIED")
        self.assertError(client.post("/api/v1/semesters/", {"semester_number": 1}, format="json"), 403, "PERMISSION_DENIED")


class PeopleTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.client = self.client_for(self.make_admin(self.college))
        self.sem = self.make_semester(self.college)
        self.section = self.make_section(self.sem)

    def test_faculty_create_activate_and_email_uniqueness(self):
        r = self.client.post("/api/v1/faculty/", {"name": "New Fac", "email": "NEW@fac.edu", "phone": "98765 43210"}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual((body["email"], body["status"], body["phone"]), ("new@fac.edu", "INACTIVE", "9876543210"))

        r = self.client.post("/api/v1/faculty/", {"name": "Dup", "email": "new@fac.edu"}, format="json")
        self.assertError(r, 409, "CONFLICT")
        self.assertIn("email", r.json()["error"]["details"])

        r = self.client.post(f"/api/v1/faculty/{body['id']}/activate/")
        self.assertEqual(r.json()["status"], "ACTIVE")
        self.assertError(self.client.post(f"/api/v1/faculty/{body['id']}/activate/"), 409, "CONFLICT")
        self.assertEqual(EmailOutbox.objects.count(), 1)

        r = self.client.patch(f"/api/v1/faculty/{body['id']}/", {"name": "Renamed", "email": "other@x.edu"}, format="json")
        self.assertEqual(r.json()["name"], "Renamed")
        self.assertEqual(r.json()["email"], "new@fac.edu")  # email never changes

        self.assertEqual(self.client.get("/api/v1/faculty/?status=ACTIVE&search=renam").json()["count"], 1)

    def test_students_crud_and_bulk_activation(self):
        for i in range(3):
            r = self.client.post(
                "/api/v1/students/",
                {"name": f"Stu {i}", "email": f"s{i}@x.edu", "roll_number": f" R{i} ", "section_id": str(self.section.id)},
                format="json",
            )
            self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["roll_number"], "R2")
        self.assertEqual(r.json()["semester"]["semester_number"], 7)

        r = self.client.post(
            "/api/v1/students/",
            {"name": "Dup", "email": "dup@x.edu", "roll_number": "R1", "section_id": str(self.section.id)},
            format="json",
        )
        self.assertError(r, 409, "CONFLICT")
        self.assertIn("roll_number", r.json()["error"]["details"])

        first = self.client.get("/api/v1/students/?ordering=roll_number").json()["results"][0]
        self.client.post(f"/api/v1/students/{first['id']}/activate/")

        r = self.client.post("/api/v1/students/bulk-activate/", {"section_id": str(self.section.id)}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.json()["succeeded"]), 2)
        self.assertEqual(r.json()["failed"][0]["code"], "ALREADY_ACTIVE")
        self.assertEqual(EmailOutbox.objects.count(), 3)

        r = self.client.post("/api/v1/students/bulk-activate/", {"ids": [first["id"]], "section_id": str(self.section.id)}, format="json")
        self.assertError(r, 400, "VALIDATION_ERROR")

        self.assertEqual(self.client.get(f"/api/v1/students/?semester_id={self.sem.id}&status=ACTIVE").json()["count"], 3)
        self.assertEqual(self.client.delete(f"/api/v1/students/{first['id']}/").status_code, 204)
        self.assertEqual(self.client.get("/api/v1/students/").json()["count"], 2)

    def test_pagination_shape(self):
        for i in range(3):
            self.make_faculty(self.college)
        body = self.client.get("/api/v1/faculty/?page_size=2&page=2").json()
        self.assertEqual(
            {k: body[k] for k in ("count", "page", "page_size", "total_pages")},
            {"count": 3, "page": 2, "page_size": 2, "total_pages": 2},
        )
        self.assertEqual(len(body["results"]), 1)
