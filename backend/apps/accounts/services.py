"""Account lifecycle: create, activate, deactivate, resend credentials, sessions."""

from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.common.emails import queue_credentials_email, send_after_commit
from apps.common.exceptions import Conflict

from .models import Faculty, Student, User


def ensure_email_available(email, exclude_user=None):
    qs = User.objects.filter(email=email.strip().lower())
    if exclude_user is not None:
        qs = qs.exclude(pk=exclude_user.pk)
    if qs.exists():
        raise Conflict("A user with this email already exists.", {"email": ["A user with this email already exists."]})


def ensure_roll_number_available(college, roll_number, exclude_student=None):
    qs = Student.objects.filter(college=college, roll_number=roll_number)
    if exclude_student is not None:
        qs = qs.exclude(pk=exclude_student.pk)
    if qs.exists():
        raise Conflict(
            "This roll number is already in use.", {"roll_number": ["This roll number is already in use."]}
        )


@transaction.atomic
def create_account(*, college, role, name, email, phone=""):
    """Create an INACTIVE user with an unusable password (credentials are emailed on activation)."""
    ensure_email_available(email)
    return User.objects.create_user(
        email=email, name=name, role=role, college=college, phone=phone or "", status=User.Status.INACTIVE
    )


@transaction.atomic
def create_faculty(*, college, name, email, phone=""):
    user = create_account(college=college, role=User.Role.FACULTY, name=name, email=email, phone=phone)
    return Faculty.objects.create(user=user, college=college)


@transaction.atomic
def create_student(*, college, name, email, phone="", roll_number, section):
    ensure_roll_number_available(college, roll_number)
    user = create_account(college=college, role=User.Role.STUDENT, name=name, email=email, phone=phone)
    return Student.objects.create(user=user, college=college, roll_number=roll_number, section=section)


def _blacklist(outstanding):
    outstanding = outstanding.exclude(blacklistedtoken__isnull=False)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding], ignore_conflicts=True
    )


def revoke_sessions(user):
    """Blacklist every outstanding refresh token of the user."""
    _blacklist(OutstandingToken.objects.filter(user=user))


def revoke_college_sessions(college):
    """Blacklist the refresh tokens of every user in the college."""
    _blacklist(OutstandingToken.objects.filter(user__college=college))


def activate(user, *, send_email=True):
    """Activate and email credentials right after commit. Returns the outbox item."""
    if user.is_active:
        raise Conflict("Account is already active.")
    user.status = User.Status.ACTIVE
    user.activated_at = user.activated_at or timezone.now()
    user.must_change_password = True
    user.save(update_fields=["status", "activated_at", "must_change_password", "updated_at"])
    item = queue_credentials_email(user)
    if send_email:
        send_after_commit([item.id])
    return item


def deactivate(user):
    if not user.is_active:
        raise Conflict("Account is already inactive.")
    user.status = User.Status.INACTIVE
    user.save(update_fields=["status", "updated_at"])
    revoke_sessions(user)
    return user


def resend_credentials(user):
    if not user.is_active:
        raise Conflict("Activate the account before sending credentials.")
    user.must_change_password = True
    user.save(update_fields=["must_change_password", "updated_at"])
    revoke_sessions(user)
    item = queue_credentials_email(user)
    send_after_commit([item.id])
    return item


FAILURE_CODES = {"activate": "ALREADY_ACTIVE", "deactivate": "ALREADY_INACTIVE"}


def bulk_status_change(profiles, requested_ids, action):
    """Apply activate/deactivate to Faculty/Student profiles. Returns the BulkResult dict.

    `requested_ids` are the ids the client asked for (None when selecting by filter);
    ids not found in `profiles` are reported as NOT_FOUND.
    """
    succeeded, failed, email_ids = [], [], []
    found = set()
    for profile in profiles:
        found.add(profile.pk)
        try:
            if action == "activate":
                email_ids.append(activate(profile.user, send_email=False).id)
            else:
                deactivate(profile.user)
            succeeded.append(profile.pk)
        except Conflict as exc:
            failed.append({"id": profile.pk, "code": FAILURE_CODES[action], "message": str(exc.detail)})
    send_after_commit(email_ids)  # one batch, one SMTP session
    for missing in [i for i in (requested_ids or []) if i not in found]:
        failed.append({"id": missing, "code": "NOT_FOUND", "message": "Not found."})
    return {"succeeded": succeeded, "failed": failed}
