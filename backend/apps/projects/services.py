"""Phases (status, lock, overlap) and phase submissions."""

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.common.exceptions import Conflict, InvalidInput

from .models import Phase, PhaseCriterion, PhaseSubmission, SubmissionLink


# ---------------------------------------------------------------- phases


def overlapping_phase(semester_subject_id, start_date, end_date, exclude_id=None):
    """The first phase of the offering whose [start, end] days overlap the given ones."""
    qs = Phase.objects.filter(
        semester_subject_id=semester_subject_id, start_date__lte=end_date, end_date__gte=start_date
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.order_by("start_date").first()


def ensure_no_overlap(semester_subject_id, start_date, end_date, exclude_id=None):
    clash = overlapping_phase(semester_subject_id, start_date, end_date, exclude_id)
    if clash:
        raise Conflict(
            f"These dates overlap {clash.name} ({clash.start_date:%d %b %Y} – {clash.end_date:%d %b %Y}). "
            "Phases of a subject can't overlap."
        )


def save_phase(phase):
    """Save with the status refreshed; the exclusion constraint is the race-proof backstop."""
    phase.status = phase.effective_status()
    try:
        with transaction.atomic():
            phase.save()
    except IntegrityError as exc:
        if "ex_phase_no_overlap" in str(exc):
            raise Conflict("These dates overlap another phase of this subject.") from exc
        if "uq_phase_name_per_offering" in str(exc):
            raise InvalidInput(details={"name": ["A phase with this name already exists for this subject."]}) from exc
        raise
    return phase


@transaction.atomic
def save_criteria(phase, items):
    """Replace the phase's rubric with `items` ([{id?, name, description, kind}], in order).

    Kept ids are updated (changing a criterion's kind clears the results recorded for it);
    missing ones are deleted with their results; items without an id are added.
    """
    existing = {c.pk: c for c in phase.criteria.all()}
    keep = set()
    for order, item in enumerate(items, start=1):
        cid = item.get("id")
        criterion = existing.get(cid) if cid else None
        if criterion is None:
            PhaseCriterion.objects.create(
                phase=phase, order=order, name=item["name"].strip(), description=item.get("description", "").strip(),
                kind=item.get("kind") or PhaseCriterion.Kind.CHECK,
            )
            continue
        keep.add(criterion.pk)
        kind = item.get("kind") or criterion.kind
        if kind != criterion.kind:
            criterion.results.all().delete()
        criterion.order, criterion.kind = order, kind
        criterion.name, criterion.description = item["name"].strip(), item.get("description", "").strip()
        criterion.save(update_fields=["order", "kind", "name", "description", "updated_at"])
    phase.criteria.filter(pk__in=set(existing) - keep).delete()


def next_order(semester_subject_id):
    last = Phase.objects.filter(semester_subject_id=semester_subject_id).order_by("-order").values_list("order", flat=True).first()
    return (last or 0) + 1


@transaction.atomic
def lock_phase(phase, user):
    if phase.locked_at:
        raise Conflict("This phase is already locked.")
    if phase.effective_status() != Phase.Status.CLOSED:
        raise Conflict("A phase can be locked only after its end date (once submissions have closed).")
    phase.locked_at = timezone.now()
    phase.locked_by = user
    return save_phase(phase)


@transaction.atomic
def unlock_phase(phase, user):
    if not phase.locked_at:
        raise Conflict("This phase is not locked.")
    phase.locked_at = None
    phase.locked_by = None
    phase.unlocked_at = timezone.now()  # stops the job from re-locking it at evaluation_end_date
    return save_phase(phase)


@transaction.atomic
def reorder(semester_subject_id, ids):
    phases = {p.id: p for p in Phase.objects.select_for_update().filter(semester_subject_id=semester_subject_id)}
    if set(ids) != set(phases):
        raise InvalidInput(details={"ids": ["Send every phase of this subject exactly once."]})
    for index, pk in enumerate(ids, start=1):
        if phases[pk].order != index:
            phases[pk].order = index
            phases[pk].save(update_fields=["order", "updated_at"])


def sync_statuses(today=None):
    """Job: auto-lock phases past evaluation_end_date and refresh stored statuses. Idempotent."""
    today = today or timezone.localdate()
    locked = updated = 0
    for phase in Phase.objects.all().iterator():
        fields = []
        if phase.due_for_auto_lock(today):
            phase.locked_at = timezone.now()
            fields.append("locked_at")
            locked += 1
        status = phase.effective_status(today)
        if status != phase.status:
            phase.status = status
            fields.append("status")
        if fields:
            phase.save(update_fields=[*fields, "updated_at"])
            updated += 1
    return {"phases_updated": updated, "phases_auto_locked": locked}


# ---------------------------------------------------------------- submissions


@transaction.atomic
def save_submission(team, phase, student, *, links, notes, submit, project=None):
    """Replace the team's links for the phase. Only while the phase is OPEN (dates checked directly).

    In the project phase (the subject's first phase) the team also sends its project title and
    description (both required to submit; links optional) and may change its team name.
    `project` = {"project_title", "project_description", "team_name"}, each optional.
    """
    if not phase.accepts_submissions():
        status = phase.effective_status()
        if status == Phase.Status.UPCOMING:
            raise Conflict(f"{phase.name} opens on {phase.start_date:%d %b %Y}.")
        raise Conflict(f"Submissions for {phase.name} closed on {phase.end_date:%d %b %Y}.")
    project = project or {}
    old = {}
    if phase.is_project_phase:
        from apps.teams import services as team_services

        title = project.get("project_title", team.project_title).strip()
        description = project.get("project_description", team.project_description).strip()
        if submit:
            errors = {}
            if not title:
                errors["project_title"] = ["Enter your project title."]
            if not description:
                errors["project_description"] = ["Describe your project."]
            if errors:
                raise InvalidInput(details=errors)
        old.update(project_title=team.project_title, project_description=team.project_description, team_name=team.name)
        if "team_name" in project and project["team_name"].strip() != team.name:
            try:
                team_services.rename(team, project["team_name"], student.user)
            except InvalidInput as exc:
                raise InvalidInput(details={"team_name": (exc.details or {}).get("name", ["Choose another name."])}) from exc
        team.project_title, team.project_description = title, description
        team.save(update_fields=["project_title", "project_description", "updated_at"])
    elif submit and not links:
        raise InvalidInput(details={"links": ["Add at least one link before submitting."]})

    submission, _ = PhaseSubmission.objects.select_for_update().get_or_create(team=team, phase=phase)
    old.update(status=submission.status, links=list(submission.links.values_list("url", flat=True)))
    submission.links.all().delete()
    SubmissionLink.objects.bulk_create(
        SubmissionLink(submission=submission, link_type=link["link_type"], url=link["url"], title=link.get("title", ""))
        for link in links
    )
    submission.notes = notes if notes is not None else submission.notes
    submission.last_edited_by = student
    if submit:
        submission.status = PhaseSubmission.Status.SUBMITTED
        submission.submitted_by = student
        submission.submitted_at = timezone.now()
    else:
        submission.status = PhaseSubmission.Status.DRAFT
    submission.save()
    return submission, old
