"""Local demo data: `python manage.py seed_demo` (idempotent; DEV ONLY).

Creates college DEMO with an admin, two faculty and students in Sem 7 (sections A, B),
DAA → A, B and DSA → A. Every demo account uses DEMO_PASSWORD from .env and is ACTIVE.
"""

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.academics.models import Section, SectionSubject, Semester, SemesterSubject, Subject
from apps.accounts.models import Faculty, Student, User
from apps.colleges.models import College, CollegeSettings


class Command(BaseCommand):
    help = "Create demo data for local development (uses DEMO_PASSWORD)."

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("seed_demo is for local development only (DEBUG=True).")
        password = getattr(settings, "DEMO_PASSWORD", "")
        if not password:
            raise CommandError("Set DEMO_PASSWORD in .env first.")

        college, _ = College.objects.get_or_create(code="DEMO", defaults={"name": "Demo Institute of Technology"})
        CollegeSettings.objects.get_or_create(college=college)

        def user(email, name, role):
            u, created = User.objects.get_or_create(
                email=email, defaults={"name": name, "role": role, "college": college, "status": User.Status.ACTIVE}
            )
            if created:
                u.set_password(password)
                u.must_change_password = False
                u.save()
            return u

        user("admin@demo.pms", "Demo Admin", User.Role.ADMIN)
        x = Faculty.objects.get_or_create(user=user("xavier@demo.pms", "Xavier Rao", User.Role.FACULTY), college=college)[0]
        y = Faculty.objects.get_or_create(user=user("yamini@demo.pms", "Yamini Shah", User.Role.FACULTY), college=college)[0]

        sem = Semester.objects.get_or_create(college=college, semester_number=7)[0]
        a = Section.objects.get_or_create(semester=sem, name="A")[0]
        b = Section.objects.get_or_create(semester=sem, name="B")[0]
        a.class_teacher, b.class_teacher = x, y
        a.save()
        b.save()

        daa = Subject.objects.get_or_create(college=college, code="DAA", defaults={"name": "Design & Analysis of Algorithms"})[0]
        dsa = Subject.objects.get_or_create(college=college, code="DSA", defaults={"name": "Data Structures"})[0]
        o_daa = SemesterSubject.objects.get_or_create(semester=sem, subject=daa)[0]
        o_dsa = SemesterSubject.objects.get_or_create(semester=sem, subject=dsa)[0]
        for section, offering, faculty in ((a, o_daa, x), (b, o_daa, y), (a, o_dsa, x)):
            SectionSubject.objects.get_or_create(
                section=section,
                semester_subject=offering,
                defaults={"faculty": faculty, "faculty_assigned_at": timezone.now()},
            )

        names = ["Asha Verma", "Arjun Mehta", "Ananya Iyer", "Bina Das", "Bhavesh Patel"]
        for i, name in enumerate(names):
            section = a if name.startswith("A") else b
            roll = f"CSE7{section.name}{i + 1:02d}"
            if not Student.objects.filter(college=college, roll_number=roll).exists():
                email = name.split()[0].lower() + "@demo.pms"
                u = user(email, name, User.Role.STUDENT)
                if i == 1:  # one inactive student to manage
                    u.status = User.Status.INACTIVE
                    u.save(update_fields=["status"])
                Student.objects.create(user=u, college=college, roll_number=roll, section=section)

        self.stdout.write(self.style.SUCCESS("Demo data ready: admin@demo.pms, xavier@demo.pms, yamini@demo.pms (+ students)."))
