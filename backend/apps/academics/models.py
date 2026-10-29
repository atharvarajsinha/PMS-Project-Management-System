from django.db import models
from django.db.models import Q

from apps.common.models import BaseModel


class Semester(BaseModel):
    college = models.ForeignKey("colleges.College", on_delete=models.CASCADE, related_name="semesters")
    semester_number = models.PositiveSmallIntegerField()

    class Meta:
        db_table = "semesters"
        ordering = ["semester_number"]
        constraints = [
            models.UniqueConstraint(fields=["college", "semester_number"], name="uq_semester_number_per_college"),
            models.CheckConstraint(
                condition=Q(semester_number__gte=1, semester_number__lte=12), name="ck_semester_number_range"
            ),
        ]

    def __str__(self):
        return f"Semester {self.semester_number}"


class Subject(BaseModel):
    college = models.ForeignKey("colleges.College", on_delete=models.CASCADE, related_name="subjects")
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=255)

    class Meta:
        db_table = "subjects"
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(fields=["college", "code"], name="uq_subject_code_per_college"),
        ]

    def __str__(self):
        return f"{self.code} — {self.name}"


class Section(BaseModel):
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name="sections")
    name = models.CharField(max_length=100)
    class_teacher = models.ForeignKey(
        "accounts.Faculty",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="class_teacher_sections",
    )

    class Meta:
        db_table = "sections"
        ordering = ["semester__semester_number", "name"]
        constraints = [
            models.UniqueConstraint(fields=["semester", "name"], name="uq_section_name_per_semester"),
            models.UniqueConstraint(
                fields=["semester", "class_teacher"],
                condition=Q(class_teacher__isnull=False),
                name="uq_class_teacher_per_semester",
            ),
        ]

    def __str__(self):
        return f"{self.semester} — {self.name}"


class SemesterSubject(BaseModel):
    semester = models.ForeignKey(Semester, on_delete=models.CASCADE, related_name="semester_subjects")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="semester_subjects")

    class Meta:
        db_table = "semester_subjects"
        ordering = ["semester__semester_number", "subject__code"]
        constraints = [
            models.UniqueConstraint(fields=["semester", "subject"], name="uq_semester_subject"),
        ]

    def __str__(self):
        return f"{self.semester} — {self.subject.code}"


class SectionSubject(BaseModel):
    """A section takes a subject offering; `faculty` teaches (and by default evaluates) it."""

    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="section_subjects")
    semester_subject = models.ForeignKey(
        SemesterSubject, on_delete=models.CASCADE, related_name="section_subjects"
    )
    faculty = models.ForeignKey(
        "accounts.Faculty", null=True, blank=True, on_delete=models.SET_NULL, related_name="section_subjects"
    )
    faculty_assigned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "section_subjects"
        ordering = ["section__semester__semester_number", "semester_subject__subject__code", "section__name"]
        constraints = [
            models.UniqueConstraint(fields=["section", "semester_subject"], name="uq_section_subject"),
        ]
        indexes = [models.Index(fields=["faculty"])]

    def __str__(self):
        return f"{self.section} — {self.semester_subject.subject.code}"
