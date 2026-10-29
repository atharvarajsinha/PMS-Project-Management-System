from django.core.cache import cache
from rest_framework.test import APIClient, APITestCase

from apps.accounts.models import Faculty, Student, User
from apps.academics.models import Section, Semester
from apps.colleges.models import College, CollegeSettings

PASSWORD = "Passw0rd!x"


class PMSTestCase(APITestCase):
    """Factories + login helpers. CSRF checks are off by default in APIClient."""

    def setUp(self):
        cache.clear()  # reset throttles

    # ---------------------------------------------------------------- factories
    def make_college(self, code="ALPHA", **kwargs):
        college = College.objects.create(name=kwargs.pop("name", f"{code} College"), code=code, **kwargs)
        CollegeSettings.objects.create(college=college)
        return college

    def make_user(self, role, college=None, email=None, active=True, must_change=False, password=PASSWORD, **kwargs):
        email = email or f"{role.lower()}{User.objects.count()}@example.com"
        return User.objects.create_user(
            email=email,
            name=kwargs.pop("name", email.split("@")[0]),
            role=role,
            college=college,
            password=password,
            status=User.Status.ACTIVE if active else User.Status.INACTIVE,
            must_change_password=must_change,
            **kwargs,
        )

    def make_super_admin(self):
        return self.make_user(User.Role.SUPER_ADMIN, email="root@example.com")

    def make_admin(self, college, **kwargs):
        return self.make_user(User.Role.ADMIN, college, **kwargs)

    def make_faculty(self, college, **kwargs):
        user = self.make_user(User.Role.FACULTY, college, **kwargs)
        return Faculty.objects.create(user=user, college=college)

    def make_semester(self, college, number=7):
        return Semester.objects.create(college=college, semester_number=number)

    def make_section(self, semester, name="A"):
        return Section.objects.create(semester=semester, name=name)

    def make_student(self, section, roll="R1", **kwargs):
        college = section.semester.college
        user = self.make_user(User.Role.STUDENT, college, **kwargs)
        return Student.objects.create(user=user, college=college, roll_number=roll, section=section)

    # ---------------------------------------------------------------- auth
    def login(self, user, password=PASSWORD, client=None):
        client = client or self.client
        response = client.post("/api/v1/auth/login/", {"email": user.email, "password": password}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def client_for(self, user, college_id=None):
        client = APIClient()
        self.login(user, client=client)
        if college_id:
            client.credentials(HTTP_X_COLLEGE_ID=str(college_id))
        return client

    def assertError(self, response, status_code, code):
        self.assertEqual(response.status_code, status_code, response.content)
        self.assertEqual(response.json()["error"]["code"], code, response.content)
