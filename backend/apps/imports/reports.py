"""Report downloads (College Admin): marks, students & teams, faculty, phases, rubric results.

Each report builds a header and rows once; `render` writes them as CSV (UTF-8 with BOM so Excel
opens it correctly) or as an Excel workbook (.xlsx) with a bold, frozen header row.
Filters: `semester_id` and `semester_subject_id` (subject offering), where a report uses them.
"""

import csv
import io
from collections import defaultdict
from datetime import date

from django.db.models import Count, Prefetch, Q
from django.http import HttpResponse

from apps.academics.models import Section, SemesterSubject
from apps.accounts.models import Faculty, Student
from apps.common.choices import MENTOR_ACTIVE_STATUSES, CriterionKind, EvaluationStatus, MentorStatus, SubmissionStatus
from apps.common.exceptions import InvalidInput
from apps.evaluations.models import CriterionResult, Evaluation, StudentMark
from apps.projects.models import Phase
from apps.teams.models import MentorAssignment, Team, TeamMember

FORMATS = {
    "csv": ("text/csv; charset=utf-8", "csv"),
    "xlsx": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
}


def _num(value):
    """Decimal marks → plain number for the file (12.50 → 12.5)."""
    if value is None:
        return ""
    return int(value) if value == int(value) else float(value)


class Report:
    kind = ""
    label = ""
    description = ""
    filters = ()  # "semester_id", "semester_subject_id"
    required = ()

    def __init__(self, college, params):
        self.college = college
        self.params = params

    @classmethod
    def meta(cls):
        return {
            "kind": cls.kind,
            "label": cls.label,
            "description": cls.description,
            "filters": list(cls.filters),
            "required": list(cls.required),
        }

    # ---------------------------------------------------------------- filters

    def _int_param(self, name):
        value = self.params.get(name)
        if value in (None, ""):
            if name in self.required:
                label = "a subject" if name == "semester_subject_id" else "a semester"
                raise InvalidInput(f"Choose {label} for this report.", {name: ["This field is required."]})
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            raise InvalidInput(details={name: ["Enter a valid id."]}) from None

    @property
    def semester_id(self):
        return self._int_param("semester_id")

    @property
    def offering(self):
        ss_id = self._int_param("semester_subject_id")
        if ss_id is None:
            return None
        ss = (
            SemesterSubject.objects.filter(pk=ss_id, semester__college=self.college)
            .select_related("semester", "subject")
            .first()
        )
        if ss is None:
            raise InvalidInput(details={"semester_subject_id": ["Subject not found."]})
        return ss

    # ---------------------------------------------------------------- output

    def table(self):
        """Returns (header, rows)."""
        raise NotImplementedError

    def filename(self, ext):
        parts = ["pms", self.kind]
        ss = self.offering
        if ss is not None:
            parts.append(f"sem{ss.semester.semester_number}-{ss.subject.code}")
        elif self.semester_id is not None and "semester_id" in self.filters:
            parts.append(f"semester-{self.semester_id}")
        parts.append(date.today().isoformat())
        return "-".join(p.replace(" ", "_").replace("/", "-") for p in parts) + f".{ext}"

    def render(self, fmt):
        header, rows = self.table()
        return file_response([(self.label, header, rows)], fmt, lambda ext: self.filename(ext))


def csv_text(header, rows):
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(header)
    writer.writerows(rows)
    return "\ufeff" + out.getvalue()  # BOM so Excel reads UTF-8


def xlsx_bytes(sheets):
    """sheets: [(title, header, rows)] -> workbook bytes, one sheet each, bold frozen header."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    used = set()
    for title, header, rows in sheets:
        name = "".join(ch for ch in str(title) if ch not in "[]:*?/\\")[:31] or "Sheet"
        base, n = name, 2
        while name.lower() in used:
            suffix = f" ({n})"
            name, n = base[: 31 - len(suffix)] + suffix, n + 1
        used.add(name.lower())
        ws = wb.create_sheet(name)
        ws.append(header)
        for row in rows:
            ws.append(row)
        fill = PatternFill("solid", fgColor="E8EEF7")
        for cell in ws[1]:
            cell.font = Font(bold=True)
            cell.fill = fill
            cell.alignment = Alignment(vertical="center")
        ws.freeze_panes = "A2"
        for i, col_title in enumerate(header, start=1):
            width = max([len(str(col_title))] + [len(str(r[i - 1])) for r in rows[:500] if i - 1 < len(r)])
            ws.column_dimensions[get_column_letter(i)].width = min(max(width + 2, 8), 60)
        if rows:
            ws.auto_filter.ref = ws.dimensions
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def file_response(sheets, fmt, filename):
    """Download response. CSV holds one table, so it needs exactly one sheet; `filename(ext)` names the file."""
    if fmt not in FORMATS:
        raise InvalidInput(details={"file_format": ["Choose csv or xlsx."]})
    content_type, ext = FORMATS[fmt]
    if fmt == "csv":
        _, header, rows = sheets[0]
        body = csv_text(header, rows)
    else:
        body = xlsx_bytes(sheets)
    response = HttpResponse(body, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename(ext)}"'
    return response


# ---------------------------------------------------------------- marks


class MarksReport(Report):
    kind = "marks"
    label = "Marks (phase-wise)"
    description = "One row per student of a subject: their team, marks in every phase, and the total."
    filters = ("semester_subject_id",)
    required = ("semester_subject_id",)

    def table(self):
        ss = self.offering
        phases = list(Phase.objects.filter(semester_subject=ss).order_by("order", "start_date"))
        marks = defaultdict(dict)  # student_id → {phase_id: marks}
        status = {}  # (team_id, phase_id) → evaluation status
        for m in StudentMark.objects.filter(evaluation__assignment__phase__semester_subject=ss).select_related(
            "evaluation__assignment"
        ):
            marks[m.student_id][m.evaluation.assignment.phase_id] = m.marks
        for e in Evaluation.objects.filter(assignment__phase__semester_subject=ss).select_related("assignment"):
            status[(e.assignment.team_id, e.assignment.phase_id)] = e.status

        header = ["Roll number", "Name", "Section", "Team", "Role"]
        header += [f"{p.name} (/{_num(p.max_marks)})" for p in phases]
        header += [f"Total (/{_num(sum(p.max_marks for p in phases))})"] if phases else ["Total"]

        members = (
            TeamMember.objects.filter(semester_subject=ss)
            .select_related("student__user", "student__section", "team")
            .order_by("student__section__name", "student__roll_number")
        )
        rows = []
        for tm in members:
            st = tm.student
            row = [st.roll_number, st.user.name, st.section.name, tm.team.display_name, "Lead" if tm.team.lead_id == st.pk else "Member"]
            total = 0
            for p in phases:
                value = marks[st.pk].get(p.pk)
                if value is None:
                    row.append("Pending" if status.get((tm.team_id, p.pk)) is None else "")
                else:
                    total += value
                    row.append(_num(value))
            row.append(_num(total))
            rows.append(row)
        return header, rows


# ---------------------------------------------------------------- students & teams


class StudentsReport(Report):
    kind = "students"
    label = "Students & teams"
    description = (
        "Students with their section and account status. With a subject chosen: their team, role, "
        "mentor and project title in that subject."
    )
    filters = ("semester_id", "semester_subject_id")

    def table(self):
        ss = self.offering
        qs = Student.objects.filter(college=self.college).select_related("user", "section__semester")
        if ss is not None:
            qs = qs.filter(section__semester=ss.semester)
        elif self.semester_id is not None:
            qs = qs.filter(section__semester_id=self.semester_id)
        qs = qs.order_by("section__semester__semester_number", "section__name", "roll_number")

        header = ["Roll number", "Name", "Email", "Phone", "Semester", "Section", "Account"]
        if ss is None:
            memberships = defaultdict(list)
            for tm in TeamMember.objects.filter(student__in=qs).select_related("team", "semester_subject__subject"):
                role = " (Lead)" if tm.team.lead_id == tm.student_id else ""
                memberships[tm.student_id].append(f"{tm.semester_subject.subject.code}: {tm.team.display_name}{role}")
            header.append("Teams")
            return header, [
                [s.roll_number, s.user.name, s.user.email, s.user.phone, s.section.semester.semester_number, s.section.name,
                 s.user.get_status_display(), "; ".join(memberships[s.pk])]
                for s in qs
            ]

        teams = {}
        for tm in TeamMember.objects.filter(semester_subject=ss).select_related("team"):
            teams[tm.student_id] = tm.team
        mentors = defaultdict(list)
        for a in MentorAssignment.objects.filter(team__semester_subject=ss, status=MentorStatus.ACCEPTED).select_related("faculty__user"):
            mentors[a.team_id].append(a.faculty.user.name)
        header += ["Team", "Role", "Mentor", "Project title"]
        rows = []
        for s in qs:
            team = teams.get(s.pk)
            rows.append([
                s.roll_number, s.user.name, s.user.email, s.user.phone, s.section.semester.semester_number, s.section.name,
                s.user.get_status_display(),
                team.display_name if team else "Not in a team",
                ("Lead" if team.lead_id == s.pk else "Member") if team else "",
                ", ".join(mentors[team.pk]) if team else "",
                team.project_title if team else "",
            ])
        return header, rows


# ---------------------------------------------------------------- faculty


class FacultyReport(Report):
    kind = "faculty"
    label = "Faculty"
    description = "Faculty with their profile (specializations, research, papers, certifications) and workload."

    def table(self):
        qs = (
            Faculty.objects.filter(college=self.college)
            .select_related("user")
            .prefetch_related(
                "specializations",
                Prefetch("class_teacher_sections", queryset=Section.objects.select_related("semester")),
            )
            .annotate(
                teaching_count=Count("section_subjects", distinct=True),
                mentoring_count=Count(
                    "mentor_assignments", filter=Q(mentor_assignments__status__in=MENTOR_ACTIVE_STATUSES), distinct=True
                ),
                evaluation_teams_count=Count("evaluator_assignments__team", distinct=True),
            )
            .order_by("user__name")
        )
        header = [
            "Name", "Email", "Phone", "Account", "Designation", "Qualification", "Experience (years)", "Specializations",
            "Research areas", "Publications", "Certifications", "Class coordinator of", "Subjects taught",
            "Teams mentored", "Teams evaluated",
        ]
        rows = []
        for f in qs:
            pubs = "; ".join(
                p.get("title", "") + (f" ({p['year']})" if p.get("year") else "") for p in (f.publications or [])
            )
            certs = "; ".join(
                c.get("name", "") + (f" — {c['issuer']}" if c.get("issuer") else "") for c in (f.certifications or [])
            )
            coordinator = ", ".join(f"Sem {s.semester.semester_number} {s.name}" for s in f.class_teacher_sections.all())
            rows.append([
                f.user.name, f.user.email, f.user.phone, f.user.get_status_display(), f.designation, f.qualification,
                "" if f.experience_years is None else f.experience_years,
                "; ".join(s.name for s in f.specializations.all()), f.research_areas, pubs, certs, coordinator,
                f.teaching_count, f.mentoring_count, f.evaluation_teams_count,
            ])
        return header, rows


# ---------------------------------------------------------------- phases


def _criteria_text(phase):
    return "; ".join(f"{c.name} ({c.get_kind_display()})" for c in phase.criteria.all())


class PhasesReport(Report):
    kind = "phases"
    label = "Phases & criteria"
    description = "Every phase with its dates, max marks, rubric criteria, and submission / evaluation counts."
    filters = ("semester_id", "semester_subject_id")

    def table(self):
        qs = Phase.objects.filter(semester_subject__semester__college=self.college)
        ss = self.offering
        if ss is not None:
            qs = qs.filter(semester_subject=ss)
        elif self.semester_id is not None:
            qs = qs.filter(semester_subject__semester_id=self.semester_id)
        qs = (
            qs.select_related("semester_subject__semester", "semester_subject__subject")
            .prefetch_related("criteria")
            .annotate(
                teams_count=Count("evaluator_assignments", distinct=True),
                submitted_count=Count("submissions", filter=Q(submissions__status=SubmissionStatus.SUBMITTED), distinct=True),
                evaluated_count=Count(
                    "evaluator_assignments",
                    filter=Q(evaluator_assignments__evaluation__status=EvaluationStatus.SUBMITTED),
                    distinct=True,
                ),
            )
            .order_by("semester_subject__semester__semester_number", "semester_subject__subject__code", "order", "start_date")
        )
        header = [
            "Semester", "Subject code", "Subject", "Phase #", "Phase", "Short description", "Start date", "End date",
            "Evaluation end date", "Max marks", "Status", "Criteria", "Teams", "Submitted", "Evaluated",
        ]
        rows = [
            [
                p.semester_subject.semester.semester_number, p.semester_subject.subject.code, p.semester_subject.subject.name,
                p.order, p.name, p.short_description, p.start_date.isoformat(), p.end_date.isoformat(),
                p.evaluation_end_date.isoformat() if p.evaluation_end_date else "", _num(p.max_marks),
                Phase.Status(p.effective_status()).label, _criteria_text(p), p.teams_count, p.submitted_count, p.evaluated_count,
            ]
            for p in qs
        ]
        return header, rows


class RubricReport(Report):
    kind = "rubric"
    label = "Rubric results"
    description = "Each team's tick / cross or rating for every criterion of every phase of a subject."
    filters = ("semester_subject_id",)
    required = ("semester_subject_id",)

    def table(self):
        ss = self.offering
        phases = list(Phase.objects.filter(semester_subject=ss).order_by("order", "start_date").prefetch_related("criteria"))
        results = {
            (r.evaluation.assignment.team_id, r.criterion_id): r.value
            for r in CriterionResult.objects.filter(criterion__phase__semester_subject=ss).select_related("evaluation__assignment")
        }
        teams = Team.objects.filter(semester_subject=ss).select_related("lead__user").order_by("name", "id")
        header = ["Team", "Team Lead", "Project title", "Phase", "Criterion", "Type", "Result"]
        rows = []
        for team in teams:
            for p in phases:
                for c in p.criteria.all():
                    value = results.get((team.pk, c.pk))
                    if value is None:
                        shown = ""
                    elif c.kind == CriterionKind.CHECK:
                        shown = "✓" if value else "✗"
                    else:
                        shown = f"{value}/5"
                    rows.append([team.display_name, team.lead.user.name, team.project_title, p.name, c.name, c.get_kind_display(), shown])
        return header, rows


REPORTS = {cls.kind: cls for cls in (MarksReport, StudentsReport, FacultyReport, PhasesReport, RubricReport)}
