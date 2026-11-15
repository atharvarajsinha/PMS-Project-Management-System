from django.core.files.uploadedfile import SimpleUploadedFile

from apps.academics.models import Section, SectionSubject, Semester, SemesterSubject, Subject
from apps.accounts.models import Faculty, Student, User
from apps.common.models import AuditLog
from apps.common.tests.base import PMSTestCase


def csv_file(text, name="data.csv"):
    return SimpleUploadedFile(name, text.encode("utf-8"), content_type="text/csv")


class ImportTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.client = self.client_for(self.make_admin(self.college))

    def upload(self, kind, text, dry_run=False):
        url = f"/api/v1/imports/{kind}/" + ("?dry_run=true" if dry_run else "")
        return self.client.post(url, {"file": csv_file(text)}, format="multipart")

    def test_kinds_and_templates(self):
        r = self.client.get("/api/v1/imports/")
        kinds = [k["kind"] for k in r.json()["results"]]
        self.assertEqual(kinds, ["faculty", "semesters", "subjects", "sections", "students", "subject-mappings", "mentors"])
        r = self.client.get("/api/v1/imports/students/template/")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.content.decode().startswith("name,email,roll_number,semester,section,phone"))
        self.assertEqual(self.client.get("/api/v1/imports/nope/template/").status_code, 404)

    def test_faculty_partial_import_keeps_valid_rows(self):
        self.make_faculty(self.college, email="taken@x.edu")
        text = (
            "Name,Email,Phone,Extra\n"
            "Ravi Kumar,ravi@x.edu,+91 98000 00001,ignored\n"
            "Bad Email,not-an-email,,\n"
            "Dup,taken@x.edu,,\n"
            ",,,\n"
            "Ravi Again,RAVI@x.edu,,\n"
        )
        r = self.upload("faculty", text)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body["total"], body["created"], body["error"]), (4, 1, 3))
        self.assertEqual(body["ignored_columns"], ["extra"])
        errors = {row["row"]: row for row in body["rows"] if row["status"] == "error"}
        self.assertIn("email", errors[3]["errors"])
        self.assertIn("already exists", errors[4]["message"])
        self.assertIn(6, errors)  # duplicate within the file
        ravi = Faculty.objects.get(user__email="ravi@x.edu")
        self.assertEqual(ravi.user.status, User.Status.INACTIVE)
        self.assertEqual(ravi.user.phone, "+919800000001")
        self.assertTrue(AuditLog.objects.filter(action="import.faculty").exists())

    def test_dry_run_saves_nothing_but_reports_the_same(self):
        r = self.upload("semesters", "semester_number\n7\n7\n13\n", dry_run=True)
        body = r.json()
        self.assertTrue(body["dry_run"])
        self.assertEqual([row["status"] for row in body["rows"]], ["created", "error", "error"])
        self.assertFalse(Semester.objects.exists())

    def test_missing_required_column_rejects_file(self):
        r = self.upload("subjects", "code\nCS1\n")
        self.assertError(r, 400, "VALIDATION_ERROR")
        self.assertIn("name", r.json()["error"]["message"])

    def test_students_resolve_semester_and_section(self):
        sem = self.make_semester(self.college, 7)
        self.make_section(sem, "A")
        text = (
            "name,email,roll_number,semester,section\n"
            "Asha,asha@x.edu,R1,Sem 7,a\n"
            "Bina,bina@x.edu,R2,8,A\n"
            "Chirag,chirag@x.edu,R3,7,Z\n"
            "Dev,dev@x.edu,R1,7,A\n"
        )
        rows = self.upload("students", text).json()["rows"]
        self.assertEqual([r["status"] for r in rows], ["created", "error", "error", "error"])
        self.assertIn("Semester 8 does not exist", rows[1]["errors"]["semester"])
        self.assertIn("Section Z does not exist", rows[2]["errors"]["section"])
        self.assertIn("roll_number", rows[3]["errors"])
        self.assertEqual(Student.objects.get().section.name, "A")

    def test_sections_create_and_assign_class_teachers(self):
        sem = self.make_semester(self.college, 7)
        self.make_section(sem, "B")
        x = self.make_faculty(self.college, email="x@x.edu")
        text = (
            "semester,section,class_teacher_email\n"
            "7,A,x@x.edu\n"
            "7,B,\n"
            "7,C,x@x.edu\n"
            "7,D,nobody@x.edu\n"
        )
        rows = self.upload("sections", text).json()["rows"]
        self.assertEqual([r["status"] for r in rows], ["created", "skipped", "error", "error"])
        self.assertIn("already class teacher", rows[2]["errors"]["class_teacher_email"])
        self.assertEqual(Section.objects.get(name="A").class_teacher, x)
        # existing section: change class teacher
        rows = self.upload("sections", "semester,section,class_teacher_email\n7,B,x@x.edu\n").json()["rows"]
        self.assertEqual(rows[0]["status"], "error")  # x already teaches A in this semester

    def test_subject_mappings_offer_map_and_assign(self):
        sem = self.make_semester(self.college, 7)
        a, b = self.make_section(sem, "A"), self.make_section(sem, "B")
        Subject.objects.create(college=self.college, code="CS701", name="Algorithms")
        x = self.make_faculty(self.college, email="x@x.edu")
        text = (
            "semester,subject_code,section,faculty_email\n"
            "7,cs701,A,x@x.edu\n"
            "7,CS701,B,\n"
            "7,CS999,A,\n"
            "7,CS701,B,x@x.edu\n"
            "7,CS701,A,x@x.edu\n"
        )
        rows = self.upload("subject-mappings", text).json()["rows"]
        self.assertEqual([r["status"] for r in rows], ["created", "created", "error", "updated", "skipped"])
        self.assertEqual(SemesterSubject.objects.count(), 1)
        self.assertEqual(SectionSubject.objects.get(section=a).faculty, x)
        self.assertEqual(SectionSubject.objects.get(section=b).faculty, x)

    def test_faculty_cannot_import(self):
        faculty = self.make_faculty(self.college)
        client = self.client_for(faculty.user)
        r = client.post("/api/v1/imports/faculty/", {"file": csv_file("name,email\nA,a@x.edu\n")}, format="multipart")
        self.assertEqual(r.status_code, 403)


class BulkDeleteTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.client = self.client_for(self.make_admin(self.college))

    def test_bulk_delete_reports_blocked_and_missing(self):
        sem = self.make_semester(self.college, 7)
        empty, busy = self.make_section(sem, "A"), self.make_section(sem, "B")
        self.make_student(busy)
        other = self.make_section(self.make_semester(self.make_college("BETA"), 1), "A")
        r = self.client.post("/api/v1/sections/bulk-delete/", {"ids": [empty.id, busy.id, other.id]}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["succeeded"], [empty.id])
        codes = {f["id"]: f["code"] for f in r.json()["failed"]}
        self.assertEqual(codes, {busy.id: "HAS_DEPENDENTS", other.id: "NOT_FOUND"})
        self.assertTrue(Section.objects.filter(pk=other.pk).exists())

    def test_bulk_delete_people(self):
        f1, f2 = self.make_faculty(self.college), self.make_faculty(self.college)
        r = self.client.post("/api/v1/faculty/bulk-delete/", {"ids": [f1.id, f2.id]}, format="json")
        self.assertEqual(sorted(r.json()["succeeded"]), sorted([f1.id, f2.id]))
        self.assertFalse(User.objects.filter(role=User.Role.FACULTY).exists())

    def test_class_teacher_cannot_bulk_delete_students(self):
        teacher = self.make_faculty(self.college)
        section = self.make_section(self.make_semester(self.college))
        section.class_teacher = teacher
        section.save()
        student = self.make_student(section)
        client = self.client_for(teacher.user)
        r = client.post(f"/api/v1/my/class-sections/{section.id}/students/bulk-delete/", {"ids": [student.id]}, format="json")
        self.assertEqual(r.status_code, 405)
        self.assertTrue(Student.objects.filter(pk=student.pk).exists())

class MentorImportTests(PMSTestCase):
    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.client = self.client_for(self.make_admin(self.college))

    def upload(self, kind, text, dry_run=False):
        url = f"/api/v1/imports/{kind}/" + ("?dry_run=true" if dry_run else "")
        return self.client.post(url, {"file": csv_file(text)}, format="multipart")

    def test_mentors_import_creates_updates_and_reports(self):
        from apps.teams.models import SemesterMentor

        sem7 = Semester.objects.create(college=self.college, semester_number=7)
        Semester.objects.create(college=self.college, semester_number=5)
        ravi = self.make_faculty(self.college, email="ravi@x.edu")
        self.make_faculty(self.college, email="meera@x.edu")
        SemesterMentor.objects.create(semester=sem7, faculty=ravi, capacity=2)
        text = (
            "semester,faculty_email,capacity\n"
            "7,ravi@x.edu,4\n"  # update capacity
            "7,meera@x.edu,\n"  # default capacity
            "5,ravi@x.edu,1\n"  # another semester
            "9,ravi@x.edu,1\n"  # no such semester
            "7,nobody@x.edu,1\n"  # no such faculty
            "7,meera@x.edu,0\n"  # bad capacity
        )
        preview = self.upload("mentors", text, dry_run=True).json()
        self.assertEqual(SemesterMentor.objects.count(), 1)  # dry run saves nothing
        rows = self.upload("mentors", text).json()["rows"]
        self.assertEqual([r["status"] for r in rows], [r["status"] for r in preview["rows"]])
        self.assertEqual([r["status"] for r in rows], ["updated", "created", "created", "error", "error", "error"])
        caps = {(m.semester.semester_number, m.faculty.user.email): m.capacity for m in SemesterMentor.objects.select_related("semester", "faculty__user")}
        default = self.college.settings.default_mentor_capacity
        self.assertEqual(caps, {(7, "ravi@x.edu"): 4, (7, "meera@x.edu"): default, (5, "ravi@x.edu"): 1})
