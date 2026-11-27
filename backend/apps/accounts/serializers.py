from django.contrib.auth import password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Model
from rest_framework import serializers

from apps.academics.models import Section
from apps.common.serializers import (
    CollegeScopedPKField,
    LowerEmailField,
    PhoneField,
    SectionBriefSerializer,
    SemesterBriefSerializer,
)

from . import services
from .models import Faculty, Specialization, Student, User


def ensure_teams_allow_move(student, new_section):
    """A student in a team may move only to a section that also takes that team's subject."""
    from apps.academics.models import SectionSubject
    from apps.common.exceptions import Conflict
    from apps.teams.models import TeamMember

    taken = set(SectionSubject.objects.filter(section=new_section).values_list("semester_subject_id", flat=True))
    blocking = (
        TeamMember.objects.filter(student=student)
        .exclude(semester_subject_id__in=taken)
        .select_related("semester_subject__subject")
    )
    codes = sorted({m.semester_subject.subject.code for m in blocking})
    if codes:
        raise Conflict(
            f"{student.user.name} is in a team for {', '.join(codes)}, which section {new_section.name} doesn't take. "
            "Remove them from that team first."
        )


def resync_led_teams(student):
    """The default evaluator follows the Team Lead's section (only before teams are locked)."""
    from apps.evaluations.services import sync_team

    if student.college.settings.teams_locked:
        return
    for team in student.led_teams.select_related("lead", "semester_subject"):
        sync_team(team)


def validate_new_password(password, user):
    """Run Django's password validators; errors are reported on `new_password`."""
    try:
        password_validation.validate_password(password, user)
    except DjangoValidationError as exc:
        raise serializers.ValidationError({"new_password": list(exc.messages)})
    return password


# ---------------------------------------------------------------- /me


class MeSerializer(serializers.ModelSerializer):
    college = serializers.SerializerMethodField()
    faculty = serializers.SerializerMethodField()
    student = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id", "email", "name", "phone", "role", "status", "must_change_password",
            "last_login_at", "college", "faculty", "student",
        ]

    def get_college(self, user) -> dict | None:
        c = user.college
        return {"id": c.id, "name": c.name, "code": c.code} if c else None

    def get_faculty(self, user) -> dict | None:
        faculty = getattr(user, "faculty", None) if user.role == User.Role.FACULTY else None
        return {"id": faculty.id} if faculty else None

    def get_student(self, user) -> dict | None:
        if user.role != User.Role.STUDENT:
            return None
        student = Student.objects.select_related("section__semester").filter(user=user).first()
        if not student:
            return None
        return {
            "id": student.id,
            "roll_number": student.roll_number,
            "semester": SemesterBriefSerializer(student.section.semester).data,
            "section": SectionBriefSerializer(student.section).data,
        }


class MeUpdateSerializer(serializers.ModelSerializer):
    phone = PhoneField()

    class Meta:
        model = User
        fields = ["name", "phone"]

    def validate(self, attrs):
        unknown = set(self.initial_data) - set(self.fields)
        if unknown:
            raise serializers.ValidationError({field: ["This field cannot be changed here."] for field in unknown})
        return attrs


# ---------------------------------------------------------------- auth


class LoginSerializer(serializers.Serializer):
    email = LowerEmailField()
    password = serializers.CharField(trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(trim_whitespace=False)

    def validate_current_password(self, value):
        if not self.context["user"].check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate(self, attrs):
        if attrs["current_password"] == attrs["new_password"]:
            raise serializers.ValidationError({"new_password": ["New password must be different from the current one."]})
        validate_new_password(attrs["new_password"], self.context["user"])
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    email = LowerEmailField()


class PasswordResetVerifySerializer(serializers.Serializer):
    email = LowerEmailField()
    otp = serializers.RegexField(r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code."})


class PasswordResetConfirmSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    new_password = serializers.CharField(trim_whitespace=False)


# ---------------------------------------------------------------- people


class _PersonSerializer(serializers.ModelSerializer):
    """Common user fields exposed on Faculty/Student/CollegeAdmin payloads."""

    user_id = serializers.IntegerField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.name", max_length=255)
    email = LowerEmailField(source="user.email", max_length=255)
    phone = PhoneField(source="user.phone")
    status = serializers.CharField(source="user.status", read_only=True)
    must_change_password = serializers.BooleanField(source="user.must_change_password", read_only=True)
    activated_at = serializers.DateTimeField(source="user.activated_at", read_only=True)
    last_login_at = serializers.DateTimeField(source="user.last_login_at", read_only=True)

    PERSON_FIELDS = [
        "id", "user_id", "name", "email", "phone", "status", "must_change_password",
        "activated_at", "last_login_at",
    ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if isinstance(self.instance, Model):
            self.fields["email"].read_only = True  # email can never change

    def update_user(self, instance, user_data):
        user = instance.user
        for field in ("name", "phone"):
            if field in user_data:
                setattr(user, field, user_data[field])
        user.save(update_fields=["name", "phone", "updated_at"])


# ---------------------------------------------------------------- faculty profile


class SpecializationSerializer(serializers.ModelSerializer):
    name = serializers.CharField(max_length=100)
    faculty_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Specialization
        fields = ["id", "name", "faculty_count", "created_at", "updated_at"]

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        qs = Specialization.objects.filter(college=self.context["college"], name__iexact=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(f"{value} already exists.")
        return value


class SpecializationBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class PublicationSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=500)
    venue = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")  # journal / conference
    year = serializers.IntegerField(min_value=1950, max_value=2100, required=False, allow_null=True, default=None)
    url = serializers.URLField(max_length=500, required=False, allow_blank=True, default="")


class CertificationSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=300)
    issuer = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    year = serializers.IntegerField(min_value=1950, max_value=2100, required=False, allow_null=True, default=None)
    url = serializers.URLField(max_length=500, required=False, allow_blank=True, default="")


class FacultyProfileFieldsMixin(serializers.Serializer):
    """Profile fields shared by the admin's faculty API and the faculty member's own profile."""

    specializations = SpecializationBriefSerializer(many=True, read_only=True)
    specialization_ids = CollegeScopedPKField(
        scope=lambda c: Specialization.objects.filter(college=c),
        many=True,
        write_only=True,
        required=False,
        source="specializations",
    )
    designation = serializers.CharField(max_length=100, required=False, allow_blank=True)
    qualification = serializers.CharField(max_length=255, required=False, allow_blank=True)
    experience_years = serializers.IntegerField(min_value=0, max_value=70, required=False, allow_null=True)
    research_areas = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    bio = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    publications = PublicationSerializer(many=True, required=False)
    certifications = CertificationSerializer(many=True, required=False)

    PROFILE_FIELDS = [
        "specializations", "specialization_ids", "designation", "qualification", "experience_years",
        "research_areas", "bio", "publications", "certifications",
    ]
    PROFILE_SCALARS = ("designation", "qualification", "experience_years", "research_areas", "bio", "publications", "certifications")

    def save_profile(self, faculty, data):
        changed = [f for f in self.PROFILE_SCALARS if f in data]
        for field in changed:
            setattr(faculty, field, data[field])
        if changed:
            faculty.save(update_fields=[*changed, "updated_at"])
        if "specializations" in data:
            faculty.specializations.set(data["specializations"])
        return faculty


class FacultyProfileSerializer(FacultyProfileFieldsMixin, serializers.ModelSerializer):
    """GET/PATCH /me/faculty-profile/ — the faculty member's own profile."""

    class Meta:
        model = Faculty
        fields = ["id", *FacultyProfileFieldsMixin.PROFILE_FIELDS, "updated_at"]

    def update(self, instance, validated_data):
        return self.save_profile(instance, validated_data)


class FacultySerializer(FacultyProfileFieldsMixin, _PersonSerializer):
    class_teacher_of = serializers.SerializerMethodField()
    teaching_count = serializers.IntegerField(read_only=True, default=0)
    # Distinct teams this faculty member evaluates in at least one phase
    evaluation_teams_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Faculty
        fields = _PersonSerializer.PERSON_FIELDS + FacultyProfileFieldsMixin.PROFILE_FIELDS + [
            "class_teacher_of", "teaching_count", "evaluation_teams_count", "created_at", "updated_at",
        ]

    def get_class_teacher_of(self, faculty) -> list[dict]:
        return [
            {
                "section_id": s.id,
                "section_name": s.name,
                "semester_id": s.semester_id,
                "semester_number": s.semester.semester_number,
            }
            for s in faculty.class_teacher_sections.all()
        ]

    def create(self, validated_data):
        user = validated_data["user"]
        faculty = services.create_faculty(
            college=self.context["college"], name=user["name"], email=user["email"], phone=user.get("phone", "")
        )
        return self.save_profile(faculty, validated_data)

    def update(self, instance, validated_data):
        self.update_user(instance, validated_data.get("user", {}))
        return self.save_profile(instance, validated_data)


class FacultyDetailSerializer(FacultySerializer):
    teaching = serializers.SerializerMethodField()

    class Meta(FacultySerializer.Meta):
        fields = FacultySerializer.Meta.fields + ["teaching"]

    def get_teaching(self, faculty) -> list[dict]:
        rows = faculty.section_subjects.select_related(
            "section__semester", "semester_subject__subject"
        ).order_by("section__semester__semester_number", "semester_subject__subject__code", "section__name")
        return [
            {
                "section_subject_id": ss.id,
                "semester_number": ss.section.semester.semester_number,
                "section_name": ss.section.name,
                "subject_code": ss.semester_subject.subject.code,
                "subject_name": ss.semester_subject.subject.name,
            }
            for ss in rows
        ]


class StudentSerializer(_PersonSerializer):
    roll_number = serializers.CharField(max_length=100)
    section_id = CollegeScopedPKField(
        scope=lambda college: Section.objects.filter(semester__college=college),
        source="section",
        write_only=True,
    )
    semester = SemesterBriefSerializer(source="section.semester", read_only=True)
    section = SectionBriefSerializer(read_only=True)

    class Meta:
        model = Student
        fields = _PersonSerializer.PERSON_FIELDS + [
            "roll_number", "section_id", "semester", "section", "created_at", "updated_at",
        ]

    def validate_roll_number(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def create(self, validated_data):
        user = validated_data["user"]
        return services.create_student(
            college=self.context["college"],
            name=user["name"],
            email=user["email"],
            phone=user.get("phone", ""),
            roll_number=validated_data["roll_number"],
            section=validated_data["section"],
        )

    def update(self, instance, validated_data):
        self.update_user(instance, validated_data.get("user", {}))
        if "roll_number" in validated_data:
            services.ensure_roll_number_available(instance.college, validated_data["roll_number"], instance)
            instance.roll_number = validated_data["roll_number"]
        moved = "section" in validated_data and validated_data["section"].pk != instance.section_id
        if moved:
            ensure_teams_allow_move(instance, validated_data["section"])
            instance.section = validated_data["section"]
        instance.save()
        if moved:
            resync_led_teams(instance)
        return instance


class StudentBulkSerializer(serializers.Serializer):
    """Exactly one of ids / section_id / semester_id."""

    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False, min_length=1, max_length=500)
    section_id = serializers.IntegerField(required=False)
    semester_id = serializers.IntegerField(required=False)

    def validate(self, attrs):
        given = [k for k in ("ids", "section_id", "semester_id") if k in attrs]
        if len(given) != 1:
            raise serializers.ValidationError("Provide exactly one of ids, section_id or semester_id.")
        return attrs


class ClassStudentSerializer(StudentSerializer):
    """Student as managed by their class coordinator: the section is fixed to the teacher's section."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields.pop("section_id")

    def create(self, validated_data):
        validated_data["section"] = self.context["section"]
        return super().create(validated_data)
