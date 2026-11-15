"""Evaluator assignment and marks.

Default evaluator (PRD §14): Semester → Subject → Team Lead's section → faculty of that
section-subject. Every team has one EvaluatorAssignment per phase of its offering.

`sync_*` functions keep AUTO rows equal to the default. They never touch:
- ADMIN_OVERRIDE rows,
- rows of a LOCKED phase,
- rows whose evaluation was already SUBMITTED (marks stay with whoever gave them).
"""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.academics.models import SectionSubject
from apps.common.exceptions import Conflict, InvalidInput

from .models import Evaluation, EvaluatorAssignment, StudentMark

AUTO = EvaluatorAssignment.Source.AUTO
OVERRIDE = EvaluatorAssignment.Source.ADMIN_OVERRIDE


def default_evaluator_id(team):
    return (
        SectionSubject.objects.filter(section_id=team.lead.section_id, semester_subject_id=team.semester_subject_id)
        .values_list("faculty_id", flat=True)
        .first()
    )


def _frozen(assignment):
    if assignment.phase.locked_at:
        return True
    evaluation = getattr(assignment, "evaluation", None)
    return evaluation is not None and evaluation.status == Evaluation.Status.SUBMITTED


def sync_team(team):
    """Create missing per-phase rows and move AUTO rows to the current default evaluator."""
    default_id = default_evaluator_id(team)
    phases = list(team.semester_subject.phases.all())
    existing = {
        a.phase_id: a
        for a in EvaluatorAssignment.objects.filter(team=team).select_related("phase", "evaluation")
    }
    for phase in phases:
        assignment = existing.get(phase.id)
        if assignment is None:
            EvaluatorAssignment.objects.create(team=team, phase=phase, evaluator_id=default_id, source=AUTO)
        elif assignment.source == AUTO and assignment.evaluator_id != default_id and not _frozen(assignment):
            assignment.evaluator_id = default_id
            assignment.save(update_fields=["evaluator", "updated_at"])


def sync_phase(phase):
    """New phase: every team of the offering gets its default evaluator for it."""
    from apps.teams.models import Team

    for team in Team.objects.filter(semester_subject_id=phase.semester_subject_id).select_related("lead"):
        default_id = default_evaluator_id(team)
        EvaluatorAssignment.objects.get_or_create(
            team=team, phase=phase, defaults={"evaluator_id": default_id, "source": AUTO}
        )


def sync_section_subject(section_subject):
    """Faculty of a section-subject changed: re-sync teams led from that section."""
    from apps.teams.models import Team

    teams = Team.objects.filter(
        semester_subject_id=section_subject.semester_subject_id, lead__section_id=section_subject.section_id
    ).select_related("lead", "semester_subject")
    for team in teams:
        sync_team(team)


# ---------------------------------------------------------------- admin override


def allowed_evaluator_ids(team):
    """Without cross-section evaluation: faculty teaching this subject in a section of any team member."""
    member_sections = team.members.values_list("student__section_id", flat=True)
    return set(
        SectionSubject.objects.filter(
            semester_subject_id=team.semester_subject_id, section_id__in=member_sections, faculty__isnull=False
        ).values_list("faculty_id", flat=True)
    )


@transaction.atomic
def override_evaluator(team, faculty, phases, by_user, settings):
    """Set `faculty` as evaluator of `team` for `phases`; faculty=None resets them to AUTO."""
    if faculty is not None:
        if faculty.user.status != faculty.user.Status.ACTIVE:
            raise InvalidInput(details={"evaluator_id": ["This faculty account is inactive."]})
        if not settings.allow_cross_section_evaluation and faculty.id not in allowed_evaluator_ids(team):
            raise InvalidInput(
                details={
                    "evaluator_id": [
                        "Cross-section evaluation is off: pick a faculty member who teaches this subject "
                        "in a section of one of the team's members, or turn it on in Settings."
                    ]
                }
            )
    default_id = default_evaluator_id(team)
    changed = []
    rows = EvaluatorAssignment.objects.select_for_update().filter(team=team, phase__in=phases).select_related("phase")
    for assignment in rows:
        if assignment.phase.locked_at:
            raise Conflict(f"{assignment.phase.name} is locked. Unlock it before changing its evaluator.")
        old = {"evaluator": assignment.evaluator_id, "source": assignment.source}
        if faculty is None:
            assignment.evaluator_id, assignment.source = default_id, AUTO
        else:
            assignment.evaluator_id, assignment.source = faculty.id, OVERRIDE
        assignment.assigned_by = by_user
        assignment.save(update_fields=["evaluator", "source", "assigned_by", "updated_at"])
        changed.append((assignment, old))
    return changed


# ---------------------------------------------------------------- marks


def current_submission(assignment):
    from apps.projects.models import PhaseSubmission

    return PhaseSubmission.objects.filter(team_id=assignment.team_id, phase_id=assignment.phase_id).first()


def marks_snapshot(evaluation):
    """Audit/old-value view: {"default": .., "students": {student_id: marks}, "remarks", "status"}."""
    return {
        "default": evaluation.default_marks,
        "students": {str(m.student_id): m.marks for m in evaluation.student_marks.all()},
        "remarks": evaluation.remarks,
        "status": evaluation.status,
    }


@transaction.atomic
def save_marks(assignment, *, default_marks=None, student_marks=None, remarks=None, submit, by_user, as_faculty=None, correction=False):
    """Evaluator enters marks (as_faculty), or the Admin corrects existing marks (correction=True).

    Marks are per student. `default_marks` ("same for everyone") applies to every member that
    `student_marks` ({student_id: marks}) doesn't override; every member must end up with a mark.
    - Only while the phase is CLOSED (past end date, not locked).
    - Each mark is 0..phase max. No submitted work → every mark must be 0.
    """
    phase = assignment.phase
    status = phase.effective_status()
    if status == phase.Status.LOCKED:
        raise Conflict("This phase is locked. Marks can't be changed until the Admin unlocks it.")
    if status != phase.Status.CLOSED:
        raise Conflict("Marks can be entered only after the phase's end date.")

    evaluation = Evaluation.objects.select_for_update().filter(assignment=assignment).first()
    if correction and evaluation is None:
        raise Conflict("The evaluator hasn't entered marks for this team yet.")

    members = list(
        assignment.team.members.select_related("student__user").order_by("student__roll_number").values_list(
            "student_id", "student__user__name"
        )
    )
    member_ids = {sid for sid, _ in members}
    student_marks = {int(k): Decimal(v) for k, v in (student_marks or {}).items()}
    strangers = set(student_marks) - member_ids
    if strangers:
        raise InvalidInput(details={"student_marks": ["Some students are not members of this team."]})
    default = None if default_marks is None else Decimal(default_marks)

    final, missing = {}, []
    for sid, name in members:
        value = student_marks.get(sid, default)
        if value is None:
            missing.append(name)
        else:
            final[sid] = value
    if missing:
        raise InvalidInput(details={"student_marks": [f"Enter marks for {', '.join(missing)} (or a mark for everyone)."]})
    limit = f"{phase.max_marks:g}"
    if any(v < 0 or v > phase.max_marks for v in [*final.values(), *([default] if default is not None else [])]):
        raise InvalidInput(details={"student_marks": [f"Marks must be between 0 and {limit}."]})

    submission = current_submission(assignment)
    submitted = submission is not None and submission.is_submitted
    if not submitted and any(v != 0 for v in final.values()):
        raise InvalidInput(details={"student_marks": ["This team did not submit anything for this phase, so every mark must be 0."]})

    old = None
    if evaluation is None:
        evaluation = Evaluation(assignment=assignment, max_marks=phase.max_marks)
    else:
        old = marks_snapshot(evaluation)

    evaluation.default_marks = default
    evaluation.max_marks = phase.max_marks
    evaluation.submission = submission if submitted else None
    if remarks is not None:
        evaluation.remarks = remarks
    if as_faculty is not None:
        evaluation.evaluated_by = as_faculty
    if submit and evaluation.status != Evaluation.Status.SUBMITTED:
        evaluation.status = Evaluation.Status.SUBMITTED
        evaluation.submitted_at = timezone.now()
    evaluation.updated_by = by_user
    evaluation.save()

    # members only: marks of students who have left the team are dropped
    evaluation.student_marks.exclude(student_id__in=member_ids).delete()
    existing = {m.student_id: m for m in evaluation.student_marks.all()}
    for sid, value in final.items():
        row = existing.get(sid)
        if row is None:
            StudentMark.objects.create(evaluation=evaluation, student_id=sid, marks=value)
        elif row.marks != value:
            row.marks = value
            row.save(update_fields=["marks", "updated_at"])
    return evaluation, old
