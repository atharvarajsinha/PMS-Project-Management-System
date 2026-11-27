"""Every fixed list of values (status, role, type, ...) used anywhere in PMS.

This is the single place to add, rename or relabel a value. Models, serializers,
filters and permission checks import from here, and the frontend gets the same
lists from `frontend/src/config/choices.generated.js`, which is generated from
this file:

    python manage.py export_choices

A test fails if the generated file is out of date, so a change here can't
silently drift from the UI. Changing a *value* (not just a label) also needs a
migration (`makemigrations`), since stored rows use the value.

Every class listed in `REGISTRY` is exported to the frontend under its key.
"""

from django.db import models


# ---------------------------------------------------------------- accounts & platform


class Role(models.TextChoices):
    SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
    ADMIN = "ADMIN", "Admin"
    FACULTY = "FACULTY", "Faculty"
    STUDENT = "STUDENT", "Student"


class AccountStatus(models.TextChoices):
    """Status of a user account."""

    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class CollegeStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    INACTIVE = "INACTIVE", "Inactive"


class OtpPurpose(models.TextChoices):
    PASSWORD_RESET = "PASSWORD_RESET", "Password reset"


class EmailKind(models.TextChoices):
    ACCOUNT_ACTIVATION = "ACCOUNT_ACTIVATION", "Account activation"
    GENERIC = "GENERIC", "Generic"


class EmailStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    SENT = "SENT", "Sent"
    FAILED = "FAILED", "Failed"


# ---------------------------------------------------------------- projects (Phase 2)


class PhaseStatus(models.TextChoices):
    UPCOMING = "UPCOMING", "Upcoming"  # before start date
    OPEN = "OPEN", "Open"  # submissions allowed
    CLOSED = "CLOSED", "Closed"  # past end date: submissions closed, evaluation allowed
    LOCKED = "LOCKED", "Locked"  # evaluation locked: no mark changes


class SubmissionStatus(models.TextChoices):
    DRAFT = "DRAFT", "Draft"
    SUBMITTED = "SUBMITTED", "Submitted"


class LinkType(models.TextChoices):
    REPOSITORY = "REPOSITORY", "Repository"
    DOCUMENTATION = "DOCUMENTATION", "Documentation"
    DEMO = "DEMO", "Demo"
    PRESENTATION = "PRESENTATION", "Presentation"
    GOOGLE_DRIVE = "GOOGLE_DRIVE", "Google Drive"
    GOOGLE_FORM = "GOOGLE_FORM", "Google Form"
    VIDEO = "VIDEO", "Video"
    OTHER = "OTHER", "Other"


# ---------------------------------------------------------------- teams (Phase 2)


class TeamRole(models.TextChoices):
    LEAD = "LEAD", "Team Lead"
    MEMBER = "MEMBER", "Member"


class InviteStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    ACCEPTED = "ACCEPTED", "Accepted"
    DECLINED = "DECLINED", "Declined"
    CANCELLED = "CANCELLED", "Cancelled"


class MentorStatus(models.TextChoices):
    """A team's request to / assignment of a mentor."""

    PENDING = "PENDING", "Pending"
    ACCEPTED = "ACCEPTED", "Accepted"
    REJECTED = "REJECTED", "Rejected"
    CANCELLED = "CANCELLED", "Cancelled"  # withdrawn by the team before an answer
    REMOVED = "REMOVED", "Removed"  # ended by the Admin


# ---------------------------------------------------------------- evaluations (Phase 2)


class EvaluatorSource(models.TextChoices):
    AUTO = "AUTO", "Automatic"
    ADMIN_OVERRIDE = "ADMIN_OVERRIDE", "Set by Admin"


class EvaluationStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"  # saved, can still change
    SUBMITTED = "SUBMITTED", "Submitted"


class CriterionKind(models.TextChoices):
    """How an evaluator records one rubric criterion of a phase, per team."""

    CHECK = "CHECK", "Tick / cross"
    RATING = "RATING", "Rating (1–5)"


class SubmissionProgress(models.TextChoices):
    """A team's submission for a phase, as students see it (drafts count as pending)."""

    PENDING = "PENDING", "Pending"
    SUBMITTED = "SUBMITTED", "Submitted"


class EvaluationProgress(models.TextChoices):
    """Whether a team's evaluation for a phase is done (marks submitted). Never reveals marks."""

    PENDING = "PENDING", "Pending"
    COMPLETED = "COMPLETED", "Completed"


# Statuses that still hold a mentor slot (count against capacity)
MENTOR_ACTIVE_STATUSES = (MentorStatus.PENDING, MentorStatus.ACCEPTED)

REGISTRY = {
    "Role": Role,
    "AccountStatus": AccountStatus,
    "CollegeStatus": CollegeStatus,
    "EmailStatus": EmailStatus,
    "PhaseStatus": PhaseStatus,
    "CriterionKind": CriterionKind,
    "SubmissionStatus": SubmissionStatus,
    "LinkType": LinkType,
    "TeamRole": TeamRole,
    "InviteStatus": InviteStatus,
    "MentorStatus": MentorStatus,
    "EvaluatorSource": EvaluatorSource,
    "EvaluationStatus": EvaluationStatus,
    "SubmissionProgress": SubmissionProgress,
    "EvaluationProgress": EvaluationProgress,
}


def as_dict():
    """{"PhaseStatus": [{"value": "OPEN", "label": "Open"}, ...], ...} for the frontend and the API."""
    return {name: [{"value": value, "label": str(label)} for value, label in cls.choices] for name, cls in REGISTRY.items()}
