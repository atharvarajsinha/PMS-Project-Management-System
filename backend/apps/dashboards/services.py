"""Read-only aggregates for dashboards. No tables of their own."""

from django.db.models import Count, Q

from apps.academics.models import Section, SectionSubject, Semester, SemesterSubject, Subject
from apps.accounts.models import Faculty, Student, User

INACTIVE = User.Status.INACTIVE


def college_stats(college):
    """The three headline counts (also returned as `stats` on GET /college/ for admins)."""
    return {
        "faculty": Faculty.objects.filter(college=college).count(),
        "students": Student.objects.filter(college=college).count(),
        "semesters": Semester.objects.filter(college=college).count(),
    }


def admin_dashboard(college):
    sections = Section.objects.filter(semester__college=college)
    section_subjects = SectionSubject.objects.filter(section__semester__college=college)
    semesters = (
        Semester.objects.filter(college=college)
        .annotate(
            sections_count=Count("sections", distinct=True),
            subjects_count=Count("semester_subjects", distinct=True),
            students_count=Count("sections__students", distinct=True),
        )
        .order_by("semester_number")
    )
    return {
        "counts": {
            **college_stats(college),
            "subjects": Subject.objects.filter(college=college).count(),
            "sections": sections.count(),
            "semester_subjects": SemesterSubject.objects.filter(semester__college=college).count(),
            "section_subjects": section_subjects.count(),
        },
        "pending": {
            "inactive_faculty": Faculty.objects.filter(college=college, user__status=INACTIVE).count(),
            "inactive_students": Student.objects.filter(college=college, user__status=INACTIVE).count(),
            "sections_without_class_teacher": sections.filter(class_teacher__isnull=True).count(),
            "section_subjects_without_faculty": section_subjects.filter(faculty__isnull=True).count(),
        },
        "semesters": [
            {
                "id": s.id,
                "semester_number": s.semester_number,
                "sections": s.sections_count,
                "subjects": s.subjects_count,
                "students": s.students_count,
            }
            for s in semesters
        ],
    }


def faculty_dashboard(faculty):
    class_sections = (
        Section.objects.filter(class_teacher=faculty)
        .select_related("semester")
        .annotate(
            students_count=Count("students", distinct=True),
            inactive_students=Count("students", filter=Q(students__user__status=INACTIVE), distinct=True),
            subjects_count=Count("section_subjects", distinct=True),
        )
        .order_by("semester__semester_number", "name")
    )
    teaching = (
        SectionSubject.objects.filter(faculty=faculty)
        .select_related("section__semester", "semester_subject__subject")
        .annotate(students_count=Count("section__students", distinct=True))
        .order_by("section__semester__semester_number", "semester_subject__subject__code", "section__name")
    )
    class_sections, teaching = list(class_sections), list(teaching)

    return {
        "faculty": {"id": faculty.id, "name": faculty.user.name, "email": faculty.user.email},
        "counts": {
            "class_sections": len(class_sections),
            "class_students": sum(s.students_count for s in class_sections),
            "class_students_inactive": sum(s.inactive_students for s in class_sections),
            "teaching_assignments": len(teaching),
            "teaching_subjects": len({t.semester_subject_id for t in teaching}),
            "teaching_students": sum(t.students_count for t in teaching),
        },
        "class_sections": [
            {
                "section_id": s.id,
                "section_name": s.name,
                "semester_id": s.semester_id,
                "semester_number": s.semester.semester_number,
                "students_count": s.students_count,
                "inactive_students": s.inactive_students,
                "subjects_count": s.subjects_count,
            }
            for s in class_sections
        ],
        "teaching": [
            {
                "section_subject_id": t.id,
                "semester_id": t.section.semester_id,
                "semester_number": t.section.semester.semester_number,
                "section_id": t.section_id,
                "section_name": t.section.name,
                "subject_id": t.semester_subject.subject_id,
                "subject_code": t.semester_subject.subject.code,
                "subject_name": t.semester_subject.subject.name,
                "students_count": t.students_count,
            }
            for t in teaching
        ],
    }
