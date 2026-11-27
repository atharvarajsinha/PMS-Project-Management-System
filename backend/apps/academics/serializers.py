from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import Faculty
from apps.common.exceptions import Conflict
from apps.common.serializers import (
    CollegeScopedPKField,
    FacultyBriefSerializer,
    SectionBriefSerializer,
    SemesterBriefSerializer,
    SubjectBriefSerializer,
    UpperCodeField,
)

from .models import Section, SectionSubject, Semester, SemesterSubject, Subject


def college_faculty(college):
    return Faculty.objects.filter(college=college).select_related("user")


def college_sections(college):
    return Section.objects.filter(semester__college=college).select_related("semester")


def college_semester_subjects(college):
    return SemesterSubject.objects.filter(semester__college=college).select_related("semester", "subject")


def ensure_class_teacher_free(faculty, semester, exclude_section=None):
    """A faculty member can be class coordinator of only one section per semester."""
    if faculty is None:
        return
    clash = Section.objects.filter(semester=semester, class_teacher=faculty)
    if exclude_section is not None:
        clash = clash.exclude(pk=exclude_section.pk)
    clash = clash.first()
    if clash:
        message = f"{faculty.user.name} is already class coordinator of section {clash.name} in {semester}."
        raise Conflict(message, {"class_teacher_id": [message]})


# ---------------------------------------------------------------- semesters


class SemesterSerializer(serializers.ModelSerializer):
    semester_number = serializers.IntegerField(min_value=1, max_value=12)
    sections_count = serializers.IntegerField(read_only=True, default=0)
    subjects_count = serializers.IntegerField(read_only=True, default=0)
    students_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Semester
        fields = [
            "id", "semester_number", "sections_count", "subjects_count", "students_count",
            "created_at", "updated_at",
        ]

    def validate_semester_number(self, value):
        qs = Semester.objects.filter(college=self.context["college"], semester_number=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            msg = f"Semester {value} already exists."
            raise Conflict(msg, {"semester_number": [msg]})
        return value


# ---------------------------------------------------------------- subjects


class SubjectSerializer(serializers.ModelSerializer):
    code = UpperCodeField(max_length=50)
    offered_in = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = ["id", "code", "name", "offered_in", "created_at", "updated_at"]

    def get_offered_in(self, subject) -> list[int]:
        return sorted(ss.semester.semester_number for ss in subject.semester_subjects.all())

    def validate_code(self, value):
        qs = Subject.objects.filter(college=self.context["college"], code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            msg = f"Subject code {value} already exists."
            raise Conflict(msg, {"code": [msg]})
        return value


# ---------------------------------------------------------------- sections


class SectionSubjectInSectionSerializer(serializers.ModelSerializer):
    section_subject_id = serializers.IntegerField(source="id")
    subject_code = serializers.CharField(source="semester_subject.subject.code")
    subject_name = serializers.CharField(source="semester_subject.subject.name")
    faculty = FacultyBriefSerializer(allow_null=True)

    class Meta:
        model = SectionSubject
        validators = []  # uniqueness is checked explicitly (409 CONFLICT)
        fields = ["section_subject_id", "subject_code", "subject_name", "faculty"]


class SectionSerializer(serializers.ModelSerializer):
    semester_id = CollegeScopedPKField(
        scope=lambda college: Semester.objects.filter(college=college), source="semester", write_only=True
    )
    class_teacher_id = CollegeScopedPKField(
        scope=college_faculty, source="class_teacher", write_only=True, required=False, allow_null=True
    )
    semester = SemesterBriefSerializer(read_only=True)
    class_teacher = FacultyBriefSerializer(read_only=True, allow_null=True)
    students_count = serializers.IntegerField(read_only=True, default=0)
    subjects = SectionSubjectInSectionSerializer(source="section_subjects", many=True, read_only=True)

    class Meta:
        model = Section
        validators = []  # uniqueness is checked explicitly (409 CONFLICT)
        fields = [
            "id", "name", "semester_id", "class_teacher_id", "semester", "class_teacher",
            "students_count", "subjects", "created_at", "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            # PATCH only renames; semester is fixed, class coordinator has its own endpoint
            self.fields["semester_id"].read_only = True
            self.fields["class_teacher_id"].read_only = True

    def validate_name(self, value):
        value = value.strip().upper()
        if not value:
            raise serializers.ValidationError("This field may not be blank.")
        return value

    def validate(self, attrs):
        semester = attrs.get("semester") or getattr(self.instance, "semester", None)
        name = attrs.get("name")
        if name and semester:
            qs = Section.objects.filter(semester=semester, name=name)
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                msg = f"Section {name} already exists in {semester}."
                raise Conflict(msg, {"name": [msg]})
        if attrs.get("class_teacher"):
            ensure_class_teacher_free(attrs["class_teacher"], semester, self.instance)
        return attrs


class ClassTeacherSerializer(serializers.Serializer):
    faculty_id = CollegeScopedPKField(scope=college_faculty)


# ---------------------------------------------------------------- semester subjects


class SectionInOfferingSerializer(serializers.ModelSerializer):
    section_subject_id = serializers.IntegerField(source="id")
    section_id = serializers.IntegerField()
    section_name = serializers.CharField(source="section.name")
    faculty = FacultyBriefSerializer(allow_null=True)

    class Meta:
        model = SectionSubject
        fields = ["section_subject_id", "section_id", "section_name", "faculty"]


class SemesterSubjectSerializer(serializers.ModelSerializer):
    semester_id = CollegeScopedPKField(
        scope=lambda college: Semester.objects.filter(college=college), source="semester", write_only=True
    )
    subject_id = CollegeScopedPKField(
        scope=lambda college: Subject.objects.filter(college=college), source="subject", write_only=True
    )
    semester = SemesterBriefSerializer(read_only=True)
    subject = SubjectBriefSerializer(read_only=True)
    sections = SectionInOfferingSerializer(source="section_subjects", many=True, read_only=True)

    class Meta:
        model = SemesterSubject
        validators = []  # uniqueness is checked explicitly (409 CONFLICT)
        fields = ["id", "semester_id", "subject_id", "semester", "subject", "sections", "created_at"]

    def validate(self, attrs):
        if SemesterSubject.objects.filter(semester=attrs["semester"], subject=attrs["subject"]).exists():
            msg = f"{attrs['subject'].code} is already offered in {attrs['semester']}."
            raise Conflict(msg, {"subject_id": [msg]})
        return attrs


# ---------------------------------------------------------------- section subjects


class SectionSubjectSerializer(serializers.ModelSerializer):
    section_id = CollegeScopedPKField(scope=college_sections, source="section", write_only=True)
    semester_subject_id = CollegeScopedPKField(scope=college_semester_subjects, source="semester_subject")
    faculty_id = CollegeScopedPKField(
        scope=college_faculty, source="faculty", write_only=True, required=False, allow_null=True
    )
    semester = SemesterBriefSerializer(source="section.semester", read_only=True)
    section = SectionBriefSerializer(read_only=True)
    subject = SubjectBriefSerializer(source="semester_subject.subject", read_only=True)
    faculty = FacultyBriefSerializer(read_only=True, allow_null=True)

    class Meta:
        model = SectionSubject
        fields = [
            "id", "section_id", "semester_subject_id", "faculty_id", "semester", "section", "subject",
            "faculty", "faculty_assigned_at", "created_at", "updated_at",
        ]
        read_only_fields = ["faculty_assigned_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            # PATCH only (re)assigns the faculty
            self.fields["section_id"].read_only = True
            self.fields["semester_subject_id"].read_only = True

    def validate(self, attrs):
        if self.instance is None:
            validate_mapping(attrs["section"], attrs["semester_subject"])
        return attrs

    def create(self, validated_data):
        if validated_data.get("faculty"):
            validated_data["faculty_assigned_at"] = timezone.now()
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if "faculty" in validated_data and validated_data["faculty"] != instance.faculty:
            validated_data["faculty_assigned_at"] = timezone.now() if validated_data["faculty"] else None
        return super().update(instance, validated_data)


def validate_mapping(section, semester_subject):
    if section.semester_id != semester_subject.semester_id:
        raise serializers.ValidationError(
            {"section_id": ["The section and the subject offering belong to different semesters."]}
        )
    if SectionSubject.objects.filter(section=section, semester_subject=semester_subject).exists():
        msg = f"Section {section.name} is already mapped to {semester_subject.subject.code}."
        raise Conflict(msg, {"section_id": [msg]})


class BulkMappingItemSerializer(serializers.Serializer):
    section_id = CollegeScopedPKField(scope=college_sections, source="section")
    faculty_id = CollegeScopedPKField(scope=college_faculty, source="faculty", required=False, allow_null=True)


class BulkMappingSerializer(serializers.Serializer):
    semester_subject_id = CollegeScopedPKField(scope=college_semester_subjects, source="semester_subject")
    items = serializers.ListField(child=serializers.DictField(), min_length=1, max_length=100)


# ---------------------------------------------------------------- faculty portal


class TeachingSerializer(serializers.ModelSerializer):
    """A faculty member's own section-subject assignment."""

    semester = SemesterBriefSerializer(source="section.semester", read_only=True)
    section = SectionBriefSerializer(read_only=True)
    subject = SubjectBriefSerializer(source="semester_subject.subject", read_only=True)
    class_teacher = FacultyBriefSerializer(source="section.class_teacher", read_only=True, allow_null=True)
    students_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = SectionSubject
        fields = [
            "id", "semester", "section", "subject", "class_teacher", "students_count",
            "faculty_assigned_at", "created_at",
        ]
