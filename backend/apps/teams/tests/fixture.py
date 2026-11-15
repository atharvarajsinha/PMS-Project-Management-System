from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.academics.models import SectionSubject, SemesterSubject, Subject
from apps.common.tests.base import PMSTestCase
from apps.projects.models import Phase
from apps.teams.models import SemesterMentor


def day(offset):
    return timezone.localdate() + timedelta(days=offset)


class Phase2Fixture(PMSTestCase):
    """Sem 7, sections A and B.

    DAA → A (Xavier), B (Yamini).  DSA → A only (Xavier).
    Students: A1 Asha, A2 Arjun, A3 Aman (A); B1 Bina, B2 Bala (B).
    Xavier is class teacher of A. Team formation is ON, sizes 2..3.
    """

    def setUp(self):
        super().setUp()
        self.college = self.make_college()
        self.settings = self.college.settings
        self.settings.team_formation_enabled = True
        self.settings.min_team_size = 2
        self.settings.max_team_size = 3
        self.settings.save()
        self.admin = self.make_admin(self.college)
        self.sem = self.make_semester(self.college, 7)
        self.a, self.b = self.make_section(self.sem, "A"), self.make_section(self.sem, "B")
        self.x = self.make_faculty(self.college, name="Xavier", email="x@c.edu")
        self.y = self.make_faculty(self.college, name="Yamini", email="y@c.edu")
        self.z = self.make_faculty(self.college, name="Zoya", email="z@c.edu")
        self.a.class_teacher = self.x
        self.a.save()
        daa = Subject.objects.create(college=self.college, code="DAA", name="Algorithms")
        dsa = Subject.objects.create(college=self.college, code="DSA", name="Data Structures")
        self.daa = SemesterSubject.objects.create(semester=self.sem, subject=daa)
        self.dsa = SemesterSubject.objects.create(semester=self.sem, subject=dsa)
        self.daa_a = SectionSubject.objects.create(section=self.a, semester_subject=self.daa, faculty=self.x)
        self.daa_b = SectionSubject.objects.create(section=self.b, semester_subject=self.daa, faculty=self.y)
        self.dsa_a = SectionSubject.objects.create(section=self.a, semester_subject=self.dsa, faculty=self.x)
        self.a1 = self.make_student(self.a, roll="A1", name="Asha", email="a1@c.edu")
        self.a2 = self.make_student(self.a, roll="A2", name="Arjun", email="a2@c.edu")
        self.a3 = self.make_student(self.a, roll="A3", name="Aman", email="a3@c.edu")
        self.b1 = self.make_student(self.b, roll="B1", name="Bina", email="b1@c.edu")
        self.b2 = self.make_student(self.b, roll="B2", name="Bala", email="b2@c.edu")

    # ------------------------------------------------------------ helpers
    def as_user(self, user):
        return self.client_for(user)

    def as_student(self, student):
        return self.client_for(student.user)

    def as_faculty(self, faculty):
        return self.client_for(faculty.user)

    def make_phase(self, offering=None, start=-5, end=5, eval_end=None, name=None, max_marks="20"):
        offering = offering or self.daa
        count = Phase.objects.filter(semester_subject=offering).count()
        phase = Phase(
            semester_subject=offering,
            name=name or f"Phase {count + 1}",
            start_date=day(start),
            end_date=day(end),
            evaluation_end_date=day(eval_end) if eval_end is not None else None,
            max_marks=Decimal(max_marks),
            order=count + 1,
        )
        phase.status = phase.effective_status()
        phase.save()
        from apps.evaluations.services import sync_phase

        sync_phase(phase)
        return phase

    def create_team(self, lead, offering=None, members=()):
        """Through the student API: lead creates, invites and members accept."""
        offering = offering or self.daa
        client = self.as_student(lead)
        r = client.post("/api/v1/my/teams/", {"semester_subject_id": offering.id}, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        team_id = r.json()["id"]
        for m in members:
            r = client.post(f"/api/v1/my/teams/{team_id}/invite/", {"student_id": m.id}, format="json")
            self.assertEqual(r.status_code, 200, r.content)
            invites = self.as_student(m).get("/api/v1/my/invites/").json()["results"]
            invite = next(i for i in invites if i["team_id"] == team_id)
            r = self.as_student(m).post(f"/api/v1/my/invites/{invite['id']}/accept/")
            self.assertEqual(r.status_code, 204, r.content)
        return team_id

    def add_mentor(self, faculty, capacity=2):
        return SemesterMentor.objects.create(semester=self.sem, faculty=faculty, capacity=capacity)
