"""Team formation, membership, Team Lead and mentor rules (PRD §11–13).

Rules enforced here (the database constraints are the backstop):
- teams are per semester-subject; only students of sections mapped to it may join;
- one team per student per semester-subject;
- team size within the college min/max (max on every join; min reported as "incomplete");
- students act only while team formation is on and teams are not locked;
  the Admin (`admin=True`) may change teams at any time, including locked ones;
- before the lock, a Team Lead change re-computes the default evaluator;
- mentor capacity is per semester and counts accepted teams; filling it auto-rejects other requests.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.academics.models import SectionSubject
from apps.common.choices import MENTOR_ACTIVE_STATUSES
from apps.common.exceptions import Conflict, InvalidInput
from apps.evaluations import services as evaluation_services

from .models import MentorAssignment, SemesterMentor, Team, TeamInvite, TeamMember

INVITE = TeamInvite.Status
MENTOR = MentorAssignment.Status


# ---------------------------------------------------------------- checks


def college_settings(college):
    return college.settings


def ensure_students_can_change(college):
    settings = college_settings(college)
    if settings.teams_locked:
        raise Conflict("Teams are locked. Only the Admin can change them now.")
    if not settings.team_formation_enabled:
        raise Conflict("Team formation is not open yet.")


def is_eligible(student, semester_subject):
    return SectionSubject.objects.filter(section_id=student.section_id, semester_subject=semester_subject).exists()


def ensure_eligible(student, semester_subject):
    if not is_eligible(student, semester_subject):
        raise Conflict(f"{student.user.name}'s section does not take {semester_subject.subject.code}.")


def membership(student, semester_subject):
    return TeamMember.objects.filter(student=student, semester_subject=semester_subject).select_related("team").first()


def ensure_free(student, semester_subject):
    if membership(student, semester_subject):
        raise Conflict(f"{student.user.name} is already in a {semester_subject.subject.code} team.")


def ensure_room(team, settings, adding=1):
    count = team.members.count()
    if count + adding > settings.max_team_size:
        raise Conflict(f"The team is full (maximum {settings.max_team_size} members).")


def lock_team(team):
    """Row lock so concurrent joins can't overshoot the size limit."""
    return Team.objects.select_for_update().select_related("semester_subject__subject", "lead__user").get(pk=team.pk)


def _add_member(team, student):
    try:
        with transaction.atomic():
            member = TeamMember.objects.create(team=team, student=student, semester_subject_id=team.semester_subject_id)
    except IntegrityError as exc:
        raise Conflict(f"{student.user.name} is already in a {team.semester_subject.subject.code} team.") from exc
    # any other pending invites for this subject are now moot
    TeamInvite.objects.filter(
        student=student, team__semester_subject_id=team.semester_subject_id, status=INVITE.PENDING
    ).update(status=INVITE.CANCELLED, responded_at=timezone.now(), is_automatic=True)
    return member


# ---------------------------------------------------------------- team lifecycle


@transaction.atomic
def create_team(semester_subject, lead, by_user, *, members=(), admin=False):
    college = semester_subject.semester.college
    settings = college_settings(college)
    if not admin:
        ensure_students_can_change(college)
    everyone = [lead, *[m for m in members if m.pk != lead.pk]]
    if len(everyone) > settings.max_team_size:
        raise Conflict(f"A team can have at most {settings.max_team_size} members.")
    for student in everyone:
        ensure_eligible(student, semester_subject)
        ensure_free(student, semester_subject)

    team = Team.objects.create(semester_subject=semester_subject, lead=lead, created_by=by_user)
    for student in everyone:
        _add_member(team, student)
    evaluation_services.sync_team(team)
    return team


@transaction.atomic
def delete_team(team, *, admin=False):
    """Students: the lead may disband before the lock, while no work has been submitted."""
    if not admin:
        ensure_students_can_change(team.semester_subject.semester.college)
        if team.submissions.exists():
            raise Conflict("This team has already submitted work and can't be disbanded. Ask the Admin.")
    team.delete()


# ---------------------------------------------------------------- invites


@transaction.atomic
def invite(team, student, by_user):
    team = lock_team(team)
    settings = college_settings(team.semester_subject.semester.college)
    ensure_students_can_change(team.semester_subject.semester.college)
    ensure_eligible(student, team.semester_subject)
    ensure_free(student, team.semester_subject)
    ensure_room(team, settings)
    try:
        with transaction.atomic():
            return TeamInvite.objects.create(team=team, student=student, invited_by=by_user)
    except IntegrityError as exc:
        raise Conflict(f"{student.user.name} already has a pending invite to this team.") from exc


@transaction.atomic
def cancel_invite(invite_obj):
    if invite_obj.status != INVITE.PENDING:
        raise Conflict("This invite has already been answered.")
    invite_obj.status = INVITE.CANCELLED
    invite_obj.responded_at = timezone.now()
    invite_obj.save(update_fields=["status", "responded_at", "updated_at"])
    return invite_obj


@transaction.atomic
def respond_invite(invite_obj, accept):
    invite_obj = TeamInvite.objects.select_for_update().select_related("team", "student__user").get(pk=invite_obj.pk)
    if invite_obj.status != INVITE.PENDING:
        raise Conflict("This invite is no longer open.")
    if accept:
        team = lock_team(invite_obj.team)
        settings = college_settings(team.semester_subject.semester.college)
        ensure_students_can_change(team.semester_subject.semester.college)
        ensure_eligible(invite_obj.student, team.semester_subject)
        ensure_free(invite_obj.student, team.semester_subject)
        ensure_room(team, settings)
        _add_member(team, invite_obj.student)
    invite_obj.refresh_from_db(fields=["status"])  # _add_member may have cancelled it with the others
    invite_obj.status = INVITE.ACCEPTED if accept else INVITE.DECLINED
    invite_obj.is_automatic = False  # the student's own answer, not the bulk cancel above
    invite_obj.responded_at = timezone.now()
    invite_obj.save(update_fields=["status", "is_automatic", "responded_at", "updated_at"])
    return invite_obj


# ---------------------------------------------------------------- members & lead


@transaction.atomic
def add_member(team, student, *, admin=True):
    """Admin adds a student directly (no invite)."""
    team = lock_team(team)
    settings = college_settings(team.semester_subject.semester.college)
    ensure_eligible(student, team.semester_subject)
    ensure_free(student, team.semester_subject)
    ensure_room(team, settings)
    return _add_member(team, student)


@transaction.atomic
def remove_member(team, student, *, admin=False):
    """Lead removes a member / a member leaves (before the lock), or the Admin removes anyone but the lead."""
    if not admin:
        ensure_students_can_change(team.semester_subject.semester.college)
    if student.pk == team.lead_id:
        raise Conflict("The Team Lead can't leave or be removed. Make another member the Team Lead first.")
    deleted, _ = TeamMember.objects.filter(team=team, student=student).delete()
    if not deleted:
        raise Conflict(f"{student.user.name} is not in this team.")


@transaction.atomic
def change_lead(team, student, *, admin=False):
    college = team.semester_subject.semester.college
    settings = college_settings(college)
    if not admin:
        ensure_students_can_change(college)
    if student.pk == team.lead_id:
        raise Conflict(f"{student.user.name} is already the Team Lead.")
    if not TeamMember.objects.filter(team=team, student=student).exists():
        raise Conflict(f"{student.user.name} is not in this team.")
    team.lead = student
    team.save(update_fields=["lead", "updated_at"])
    # PRD §12: after the lock, team changes never move evaluators
    if not settings.teams_locked:
        evaluation_services.sync_team(team)
    return team


@transaction.atomic
def rename(team, name, by_user):
    name = (name or "").strip()
    if name and Team.objects.filter(semester_subject_id=team.semester_subject_id, name__iexact=name).exclude(pk=team.pk).exists():
        raise InvalidInput(details={"name": ["Another team of this subject already has this name."]})
    team.name = name
    team.name_set_by = by_user
    team.name_set_at = timezone.now()
    team.save(update_fields=["name", "name_set_by", "name_set_at", "updated_at"])
    return team


def team_size_state(team, settings):
    count = getattr(team, "members_count", None)
    if count is None:
        count = team.members.count()
    return {"members_count": count, "is_complete": count >= settings.min_team_size}


# ---------------------------------------------------------------- mentors
#
# Capacity counts ACCEPTED teams only. Any number of teams may have a PENDING request to the
# same mentor; the mentor chooses. When an accept (or an Admin assignment) fills the mentor's
# last slot, every other PENDING request to them in that semester is rejected automatically.

FULL_NOTE = "Automatically rejected: the mentor has no free slots left."


def _accepted_count(faculty_id, semester_id):
    return MentorAssignment.objects.filter(
        faculty_id=faculty_id, team__semester_subject__semester_id=semester_id, status=MENTOR.ACCEPTED
    ).count()


def mentors_with_load(semester_id):
    """Semester mentor rows annotated with `accepted` (= load) and `pending` counts."""
    in_semester = Q(faculty__mentor_assignments__team__semester_subject__semester_id=semester_id)
    return SemesterMentor.objects.filter(semester_id=semester_id).select_related("faculty__user").annotate(
        load=Count("faculty__mentor_assignments", filter=in_semester & Q(faculty__mentor_assignments__status=MENTOR.ACCEPTED)),
        accepted=Count("faculty__mentor_assignments", filter=in_semester & Q(faculty__mentor_assignments__status=MENTOR.ACCEPTED)),
        pending=Count("faculty__mentor_assignments", filter=in_semester & Q(faculty__mentor_assignments__status=MENTOR.PENDING)),
    )


def active_mentorships(team):
    return team.mentor_assignments.filter(status__in=MENTOR_ACTIVE_STATUSES)


def _lock_slot(semester_id, faculty):
    """Row-lock the mentor's semester entry so accepts can't overshoot the capacity."""
    slot = SemesterMentor.objects.select_for_update().filter(semester_id=semester_id, faculty=faculty).first()
    if slot is None:
        raise Conflict(f"{faculty.user.name} is not on the mentor list for this semester.")
    return slot


def _is_full(slot):
    return _accepted_count(slot.faculty_id, slot.semester_id) >= slot.capacity


def reject_pending_if_full(slot):
    """Mentor just reached capacity: reject their other pending requests of the semester."""
    if not _is_full(slot):
        return []
    pending = list(
        MentorAssignment.objects.select_for_update().filter(
            faculty_id=slot.faculty_id, team__semester_subject__semester_id=slot.semester_id, status=MENTOR.PENDING
        )
    )
    now = timezone.now()
    for a in pending:
        a.status, a.decided_at, a.note, a.is_automatic = MENTOR.REJECTED, now, FULL_NOTE, True
        a.save(update_fields=["status", "decided_at", "note", "is_automatic", "updated_at"])
    return pending


@transaction.atomic
def request_mentor(team, faculty, by_user):
    team = lock_team(team)
    settings = college_settings(team.semester_subject.semester.college)
    if faculty.user.status != faculty.user.Status.ACTIVE:
        raise Conflict(f"{faculty.user.name} is not available.")
    if team.members.count() < settings.min_team_size:
        raise Conflict(f"Your team needs at least {settings.min_team_size} members before choosing a mentor.")
    if active_mentorships(team).exists():
        raise Conflict("Your team already has a mentor or a pending request. Cancel the request to choose again.")
    slot = _lock_slot(team.semester_subject.semester_id, faculty)
    if _is_full(slot):
        raise Conflict(f"{faculty.user.name} is full. Choose another mentor.")
    return MentorAssignment.objects.create(team=team, faculty=faculty, requested_by=by_user)


@transaction.atomic
def cancel_mentor_request(team):
    request = active_mentorships(team).select_for_update().filter(status=MENTOR.PENDING).first()
    if request is None:
        raise Conflict("There is no pending mentor request to cancel.")
    request.status = MENTOR.CANCELLED
    request.decided_at = timezone.now()
    request.save(update_fields=["status", "decided_at", "updated_at"])
    return request


@transaction.atomic
def decide_mentor_request(assignment, accept, note=""):
    """Returns (assignment, auto_rejected). Accepting the last free slot rejects the remaining requests."""
    assignment = MentorAssignment.objects.select_for_update().select_related("team__semester_subject").get(pk=assignment.pk)
    if assignment.status != MENTOR.PENDING:
        raise Conflict("This request has already been answered.")
    auto_rejected = []
    if accept:
        slot = _lock_slot(assignment.team.semester_subject.semester_id, assignment.faculty)
        if _is_full(slot):
            raise Conflict("You have no free mentor slots left. Ask the Admin to raise your capacity.")
    assignment.status = MENTOR.ACCEPTED if accept else MENTOR.REJECTED
    assignment.decided_at = timezone.now()
    assignment.note = note or ""
    assignment.save(update_fields=["status", "decided_at", "note", "updated_at"])
    if accept:
        auto_rejected = reject_pending_if_full(slot)
    return assignment, auto_rejected


@transaction.atomic
def admin_assign_mentor(team, faculty, by_user, *, replace=True, override_capacity=False):
    """Admin sets a mentor (ACCEPTED). replace=True ends the team's other mentors / pending requests.

    Returns (assignment, removed, auto_rejected)."""
    team = lock_team(team)
    removed = []
    if replace:
        for current in active_mentorships(team).select_for_update().exclude(faculty=faculty):
            current.status = MENTOR.REMOVED
            current.assigned_by = by_user
            current.decided_at = timezone.now()
            current.save(update_fields=["status", "assigned_by", "decided_at", "updated_at"])
            removed.append(current)
    slot = _lock_slot(team.semester_subject.semester_id, faculty)
    existing = active_mentorships(team).filter(faculty=faculty).first()
    if existing and existing.status == MENTOR.ACCEPTED:
        raise Conflict(f"{faculty.user.name} already mentors this team.")
    if not override_capacity and _is_full(slot):
        raise Conflict(f"{faculty.user.name} has no free mentor slots left. Tick 'Allow over capacity' to assign anyway.")
    if existing:  # admin confirms a pending request
        assignment = existing
        assignment.status = MENTOR.ACCEPTED
        assignment.assigned_by = by_user
        assignment.decided_at = timezone.now()
        assignment.save(update_fields=["status", "assigned_by", "decided_at", "updated_at"])
    else:
        assignment = MentorAssignment.objects.create(
            team=team, faculty=faculty, status=MENTOR.ACCEPTED, assigned_by=by_user, requested_by=by_user,
            decided_at=timezone.now(),
        )
    return assignment, removed, reject_pending_if_full(slot)


@transaction.atomic
def admin_remove_mentor(assignment, by_user):
    if assignment.status not in MENTOR_ACTIVE_STATUSES:
        raise Conflict("This mentor assignment has already ended.")
    assignment.status = MENTOR.REMOVED
    assignment.assigned_by = by_user
    assignment.decided_at = timezone.now()
    assignment.save(update_fields=["status", "assigned_by", "decided_at", "updated_at"])
    return assignment
