"""Bulk CSV imports (College Admin): download template → validate (dry run) → partial import.

Every row is checked with the same serializers and rules as the single-record APIs and saved
in its own savepoint, so valid rows are imported and invalid rows are reported with the reason.
A dry run does exactly the same work inside a transaction that is then rolled back, so the
preview matches what the real import will do (including duplicates within the file).
"""

import csv
import io
import re
from dataclasses import dataclass

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.academics.models import Section, SectionSubject, Semester, SemesterSubject, Subject
from apps.academics.serializers import (
    SectionSerializer,
    SemesterSerializer,
    SubjectSerializer,
    ensure_class_teacher_free,
)
from apps.accounts.models import Faculty
from apps.accounts.serializers import FacultySerializer, StudentSerializer
from apps.accounts.views_people import person_snapshot
from apps.common import audit
from apps.common.exceptions import InvalidInput, PMSError

MAX_ROWS = 2000
MAX_BYTES = 2 * 1024 * 1024


@dataclass(frozen=True)
class Column:
    name: str
    required: bool
    help: str


class RowError(Exception):
    """Row-level problem found while resolving references. `errors` maps column → message."""

    def __init__(self, errors):
        super().__init__(errors)
        self.errors = errors


def _normalize_header(name):
    return re.sub(r"[\s\-]+", "_", (name or "").strip().lower())


def read_csv(upload, columns):
    """Parse an uploaded CSV. Returns (rows, ignored_columns); rows are (line number, {column: value})."""
    if upload.size > MAX_BYTES:
        raise InvalidInput("The file is larger than 2 MB.", {"file": ["The file is larger than 2 MB."]})
    raw = upload.read()
    for encoding in ("utf-8-sig", "cp1252"):  # Excel on Windows saves "CSV" as cp1252
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise InvalidInput("Could not read the file. Save it as CSV (UTF-8).", {"file": ["Unsupported encoding."]})

    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise InvalidInput("The file is empty.", {"file": ["The file is empty."]}) from None
    except csv.Error as exc:
        raise InvalidInput(f"Not a valid CSV file: {exc}", {"file": [str(exc)]}) from None
    header = [_normalize_header(h) for h in header]

    known = {c.name for c in columns}
    missing = [c.name for c in columns if c.required and c.name not in header]
    if missing:
        message = f"Missing required column(s): {', '.join(missing)}. Download the template for the expected columns."
        raise InvalidInput(message, {"file": [message]})
    ignored = [h for h in header if h and h not in known]

    rows = []
    try:
        for line, values in enumerate(reader, start=2):
            row = {name: "" for name in known}
            for name, value in zip(header, values):
                if name in known:
                    row[name] = value.strip()
            if not any(row.values()):
                continue  # blank line
            rows.append((line, row))
            if len(rows) > MAX_ROWS:
                message = f"Too many rows: import at most {MAX_ROWS} at a time."
                raise InvalidInput(message, {"file": [message]})
    except csv.Error as exc:
        raise InvalidInput(f"Not a valid CSV file: {exc}", {"file": [str(exc)]}) from None
    if not rows:
        raise InvalidInput("The file has no data rows.", {"file": ["The file has no data rows."]})
    return rows, ignored


def _first_message(value):
    while isinstance(value, (list, tuple)) and value:
        value = value[0]
    if isinstance(value, dict):
        return _first_message(next(iter(value.values()), ""))
    return str(value)


class Importer:
    kind = ""
    label = ""
    description = ""
    columns = ()
    examples = ()
    field_columns = {}  # serializer field → CSV column, for error messages

    def __init__(self, request, college):
        self.request = request
        self.college = college
        self.context = {"request": request, "college": college}

    @classmethod
    def meta(cls):
        return {
            "kind": cls.kind,
            "label": cls.label,
            "description": cls.description,
            "columns": [{"name": c.name, "required": c.required, "help": c.help} for c in cls.columns],
        }

    @classmethod
    def template_csv(cls):
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow([c.name for c in cls.columns])
        for example in cls.examples:
            writer.writerow([example.get(c.name, "") for c in cls.columns])
        return out.getvalue()

    # ---------------------------------------------------------------- run

    def run(self, upload, dry_run):
        rows, ignored = read_csv(upload, self.columns)
        results = []
        with transaction.atomic():
            for line, row in rows:
                try:
                    with transaction.atomic():
                        status, message = self.import_row(row)
                    results.append({"row": line, "status": status, "message": message, "data": row})
                except Exception as exc:  # noqa: BLE001 — every failure becomes a row error
                    errors = self._errors_of(exc)
                    message = "; ".join(f"{column}: {text}" if column != "row" else text for column, text in errors.items())
                    results.append({"row": line, "status": "error", "message": message, "errors": errors, "data": row})
            if dry_run:
                transaction.set_rollback(True)

        summary = {status: sum(1 for r in results if r["status"] == status) for status in ("created", "updated", "skipped", "error")}
        if not dry_run:
            audit.record(self.request, f"import.{self.kind}", entity_type="import", new={**summary, "rows": len(results)})
        return {
            "kind": self.kind,
            "dry_run": dry_run,
            "total": len(results),
            **summary,
            "ignored_columns": ignored,
            "rows": results,
        }

    def _errors_of(self, exc):
        if isinstance(exc, RowError):
            return exc.errors
        if isinstance(exc, ValidationError):
            return self._map_fields(exc.detail)
        if isinstance(exc, PMSError):
            if isinstance(exc.details, dict):
                return self._map_fields(exc.details)
            return {"row": str(exc.detail)}
        if isinstance(exc, IntegrityError):
            return {"row": "Conflicts with existing data."}
        raise exc

    def _map_fields(self, detail):
        if not isinstance(detail, dict):
            return {"row": _first_message(detail)}
        errors = {}
        for field, value in detail.items():
            column = "row" if field in ("non_field_errors", "detail") else self.field_columns.get(field, field)
            errors.setdefault(column, _first_message(value))
        return errors

    def import_row(self, row):
        """Validate and save one row. Returns (status, message); raises on a row error."""
        raise NotImplementedError

    # ---------------------------------------------------------------- lookups

    def semester(self, row, column="semester"):
        value = row[column]
        match = re.fullmatch(r"(?:sem(?:ester)?\s*)?(\d{1,2})", value, re.IGNORECASE)
        if not match:
            raise RowError({column: "Enter a semester number from 1 to 12." if value else "This field is required."})
        number = int(match.group(1))
        semester = Semester.objects.filter(college=self.college, semester_number=number).first()
        if semester is None:
            raise RowError({column: f"Semester {number} does not exist. Import or create it first."})
        return semester

    def section(self, semester, row, column="section"):
        name = row[column].upper()
        if not name:
            raise RowError({column: "This field is required."})
        section = Section.objects.filter(semester=semester, name=name).first()
        if section is None:
            raise RowError({column: f"Section {name} does not exist in {semester}. Import or create it first."})
        return section

    def subject(self, row, column="subject_code"):
        code = row[column].upper()
        if not code:
            raise RowError({column: "This field is required."})
        subject = Subject.objects.filter(college=self.college, code=code).first()
        if subject is None:
            raise RowError({column: f"Subject {code} does not exist. Import or create it first."})
        return subject

    def faculty(self, row, column):
        """Optional faculty reference by email. Returns None when the cell is empty."""
        email = row[column].lower()
        if not email:
            return None
        faculty = Faculty.objects.filter(college=self.college, user__email=email).select_related("user").first()
        if faculty is None:
            raise RowError({column: f"No faculty member with email {email}."})
        return faculty

    def save(self, serializer, **kwargs):
        serializer.is_valid(raise_exception=True)
        return serializer.save(**kwargs)


# ---------------------------------------------------------------- people


class FacultyImporter(Importer):
    kind = "faculty"
    label = "Faculty"
    description = "Adds faculty accounts. They are created inactive; activate them to email their login details."
    columns = (
        Column("name", True, "Full name"),
        Column("email", True, "Unique email; used to sign in"),
        Column("phone", False, "Optional, digits with optional leading +"),
    )
    examples = (
        {"name": "Ravi Kumar", "email": "ravi.kumar@college.edu", "phone": "+919800000001"},
        {"name": "Meera Nair", "email": "meera.nair@college.edu", "phone": ""},
    )

    def import_row(self, row):
        faculty = self.save(FacultySerializer(data={k: row[k] for k in ("name", "email", "phone")}, context=self.context))
        audit.record(self.request, "faculty.create", faculty, new=person_snapshot(faculty))
        return "created", f"{faculty.user.name} added (inactive)."


class StudentImporter(Importer):
    kind = "students"
    label = "Students"
    description = "Adds student accounts to existing sections. They are created inactive; activate them to email their login details."
    columns = (
        Column("name", True, "Full name"),
        Column("email", True, "Unique email; used to sign in"),
        Column("roll_number", True, "Unique within the college"),
        Column("semester", True, "Semester number, e.g. 7"),
        Column("section", True, "Section name in that semester, e.g. A"),
        Column("phone", False, "Optional"),
    )
    examples = (
        {"name": "Asha Verma", "email": "asha.verma@college.edu", "roll_number": "CSE7A01", "semester": "7", "section": "A", "phone": ""},
        {"name": "Bina Das", "email": "bina.das@college.edu", "roll_number": "CSE7B01", "semester": "7", "section": "B", "phone": "9800000002"},
    )
    field_columns = {"section_id": "section"}

    def import_row(self, row):
        section = self.section(self.semester(row), row)
        data = {k: row[k] for k in ("name", "email", "roll_number", "phone")}
        student = self.save(StudentSerializer(data={**data, "section_id": section.pk}, context=self.context))
        audit.record(self.request, "student.create", student, new=person_snapshot(student, ("roll_number", "section")))
        return "created", f"{student.user.name} added to {section.semester}, section {section.name} (inactive)."


# ---------------------------------------------------------------- academic structure


class SemesterImporter(Importer):
    kind = "semesters"
    label = "Semesters"
    description = "Adds semesters by number (1–12)."
    columns = (Column("semester_number", True, "1 to 12"),)
    examples = ({"semester_number": "7"}, {"semester_number": "8"})

    def import_row(self, row):
        # accept "7", "Sem 7" and "Semester 7" like the other imports
        value = re.sub(r"^sem(?:ester)?\s*", "", row["semester_number"], flags=re.IGNORECASE)
        data = {"semester_number": value}
        semester = self.save(SemesterSerializer(data=data, context=self.context), college=self.college)
        audit.record(self.request, "semester.create", semester, new=audit.snapshot(semester, ("semester_number",)))
        return "created", f"{semester} added."


class SubjectImporter(Importer):
    kind = "subjects"
    label = "Subjects"
    description = "Adds subjects to the college catalogue."
    columns = (
        Column("code", True, "Unique subject code, e.g. CS701"),
        Column("name", True, "Subject name"),
    )
    examples = ({"code": "CS701", "name": "Design & Analysis of Algorithms"}, {"code": "CS702", "name": "Machine Learning"})

    def import_row(self, row):
        subject = self.save(SubjectSerializer(data=row, context=self.context), college=self.college)
        audit.record(self.request, "subject.create", subject, new=audit.snapshot(subject, ("code", "name")))
        return "created", f"{subject.code} added."


class SectionImporter(Importer):
    kind = "sections"
    label = "Sections & class teachers"
    description = (
        "Adds sections to existing semesters and sets their class teacher. "
        "For a section that already exists, a class_teacher_email assigns or changes its class teacher."
    )
    columns = (
        Column("semester", True, "Semester number, e.g. 7"),
        Column("section", True, "Section name, e.g. A"),
        Column("class_teacher_email", False, "Optional; email of an existing faculty member"),
    )
    examples = (
        {"semester": "7", "section": "A", "class_teacher_email": "ravi.kumar@college.edu"},
        {"semester": "7", "section": "B", "class_teacher_email": ""},
    )
    field_columns = {"class_teacher_id": "class_teacher_email", "semester_id": "semester", "name": "section"}

    def import_row(self, row):
        semester = self.semester(row)
        name = row["section"].upper()
        teacher = self.faculty(row, "class_teacher_email")
        existing = Section.objects.filter(semester=semester, name=name).first() if name else None

        if existing is None:
            data = {"semester_id": semester.pk, "name": name, "class_teacher_id": teacher.pk if teacher else None}
            section = self.save(SectionSerializer(data=data, context=self.context))
            audit.record(self.request, "section.create", section, new=audit.snapshot(section, ("semester", "name", "class_teacher")))
            suffix = f" with class teacher {teacher.user.name}" if teacher else ""
            return "created", f"Section {name} added to {semester}{suffix}."

        if teacher is None or existing.class_teacher_id == teacher.pk:
            return "skipped", f"Section {name} already exists in {semester}; nothing to change."
        ensure_class_teacher_free(teacher, semester, exclude_section=existing)
        old = audit.snapshot(existing, ["class_teacher"])
        existing.class_teacher = teacher
        existing.save(update_fields=["class_teacher", "updated_at"])
        audit.record(self.request, "section.class_teacher_assign", existing, old=old, new=audit.snapshot(existing, ["class_teacher"]))
        return "updated", f"{teacher.user.name} is now class teacher of section {name}."


class MappingImporter(Importer):
    kind = "subject-mappings"
    label = "Subject mappings"
    description = (
        "Maps subjects to sections and assigns the faculty who teaches each. The subject is offered in the "
        "semester automatically. For an existing mapping, a faculty_email assigns or changes its faculty."
    )
    columns = (
        Column("semester", True, "Semester number, e.g. 7"),
        Column("subject_code", True, "Code of an existing subject"),
        Column("section", True, "Section name in that semester"),
        Column("faculty_email", False, "Optional; email of the faculty member who teaches it"),
    )
    examples = (
        {"semester": "7", "subject_code": "CS701", "section": "A", "faculty_email": "ravi.kumar@college.edu"},
        {"semester": "7", "subject_code": "CS701", "section": "B", "faculty_email": "meera.nair@college.edu"},
        {"semester": "7", "subject_code": "CS702", "section": "A", "faculty_email": ""},
    )

    def import_row(self, row):
        semester = self.semester(row)
        subject = self.subject(row)
        section = self.section(semester, row)
        faculty = self.faculty(row, "faculty_email")

        offering, offered = SemesterSubject.objects.get_or_create(semester=semester, subject=subject)
        if offered:
            audit.record(self.request, "semester_subject.create", offering, new=audit.snapshot(offering, ["semester", "subject"]))
        label = f"{subject.code} → section {section.name}"

        mapping = SectionSubject.objects.filter(section=section, semester_subject=offering).first()
        if mapping is not None:
            if faculty is None or mapping.faculty_id == faculty.pk:
                return "skipped", f"{label} is already mapped; nothing to change."
            fields = ("section", "semester_subject", "faculty")
            old = audit.snapshot(mapping, fields)
            mapping.faculty = faculty
            mapping.faculty_assigned_at = timezone.now()
            mapping.save(update_fields=["faculty", "faculty_assigned_at", "updated_at"])
            audit.record(self.request, "section_subject.update", mapping, old=old, new=audit.snapshot(mapping, fields))
            return "updated", f"{label} is now taught by {faculty.user.name}."

        mapping = SectionSubject.objects.create(
            section=section,
            semester_subject=offering,
            faculty=faculty,
            faculty_assigned_at=timezone.now() if faculty else None,
        )
        audit.record(self.request, "section_subject.create", mapping, new=audit.snapshot(mapping, ("section", "semester_subject", "faculty")))
        taught = f", taught by {faculty.user.name}" if faculty else ", no faculty yet"
        return "created", f"{label} mapped{taught}{f' ({subject.code} offered in {semester})' if offered else ''}."


# ---------------------------------------------------------------- projects (Phase 2)


class MentorImporter(Importer):
    kind = "mentors"
    label = "Mentors"
    description = (
        "Adds faculty to semester mentor lists (one row per semester + faculty). "
        "A row for someone already listed updates their capacity."
    )
    columns = (
        Column("semester", True, "Semester number, e.g. 7"),
        Column("faculty_email", True, "Email of an existing faculty member"),
        Column("capacity", False, "Teams they may mentor that semester; empty = the default in Settings"),
    )
    examples = (
        {"semester": "7", "faculty_email": "ravi.kumar@college.edu", "capacity": "4"},
        {"semester": "7", "faculty_email": "meera.nair@college.edu", "capacity": ""},
        {"semester": "5", "faculty_email": "ravi.kumar@college.edu", "capacity": "2"},
    )

    def capacity(self, row):
        value = row.get("capacity", "")
        if not value:
            return None
        if not value.isdigit() or not 1 <= int(value) <= 100:
            raise RowError({"capacity": "Enter a whole number from 1 to 100."})
        return int(value)

    def import_row(self, row):
        from apps.teams.models import SemesterMentor
        from apps.teams.services import mentors_with_load, reject_pending_if_full

        semester = self.semester(row)
        faculty = self.faculty(row, "faculty_email")
        if faculty is None:
            raise RowError({"faculty_email": "This field is required."})
        capacity = self.capacity(row)
        who = f"{faculty.user.name} in {semester}"

        slot = mentors_with_load(semester.pk).filter(faculty=faculty).first()
        if slot is not None:
            if capacity is None or capacity == slot.capacity:
                return "skipped", f"{who} is already a mentor; nothing to change."
            if capacity < slot.load:
                raise RowError({"capacity": f"{faculty.user.name} already mentors {slot.load} teams in {semester}."})
            old = {"capacity": slot.capacity}
            SemesterMentor.objects.filter(pk=slot.pk).update(capacity=capacity, updated_at=timezone.now())
            slot.refresh_from_db()
            audit.record(self.request, "semester_mentor.update", slot, old=old, new={"capacity": capacity})
            reject_pending_if_full(slot)
            return "updated", f"{who}: capacity {old['capacity']} → {capacity}."

        capacity = capacity or self.college.settings.default_mentor_capacity
        slot = SemesterMentor.objects.create(semester=semester, faculty=faculty, capacity=capacity, added_by=self.request.user)
        audit.record(self.request, "semester_mentor.create", slot, new={"semester": semester.pk, "faculty": faculty.pk, "capacity": capacity})
        return "created", f"{who} can mentor up to {capacity} teams."


# In dependency order: each import only needs the ones before it.
IMPORTERS = {
    cls.kind: cls
    for cls in (
        FacultyImporter, SemesterImporter, SubjectImporter, SectionImporter, StudentImporter, MappingImporter, MentorImporter,
    )
}
