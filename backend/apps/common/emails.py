"""Email service.

- Credentials emails are recorded in EmailOutbox and sent right after the activating
  request commits (`send_after_commit`). Anything not sent then (SMTP error, or a large
  bulk activation running out of time) stays PENDING and is retried by the UptimeRobot
  job (`/api/v1/jobs/run/`). The temporary password is generated at send time, so it is
  never stored in plain text.
- Time-sensitive mail (password-reset OTP) is sent immediately with `send_now`.
- Every email is rendered from `templates/emails/<name>{_subject.txt,.txt,.html}` and sent
  as text + HTML (`render_email`).
"""

import logging
import time

from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import EmailOutbox
from .passwords import generate_temp_password

logger = logging.getLogger(__name__)


ROLE_LABELS = {"SUPER_ADMIN": "Super Admin", "ADMIN": "Admin", "FACULTY": "Faculty", "STUDENT": "Student"}


def render_email(template, user, **context):
    """Render `emails/<template>` for `user`. Returns (subject, text body, html body)."""
    context = {
        "name": user.name,
        "email": user.email,
        "role_label": ROLE_LABELS.get(user.role, ""),
        "college_name": user.college.name if user.college_id else "",
        "login_url": f"{settings.FRONTEND_URL.rstrip('/')}/login",
        **context,
    }
    subject = " ".join(render_to_string(f"emails/{template}_subject.txt", context).split())
    context["subject"] = subject
    text = render_to_string(f"emails/{template}.txt", context)
    html = render_to_string(f"emails/{template}.html", context)
    return subject, text, html


def _send(to_email, subject, text, html=None, connection=None):
    message = EmailMultiAlternatives(subject, text, settings.DEFAULT_FROM_EMAIL, [to_email], connection=connection)
    if html:
        message.attach_alternative(html, "text/html")
    message.send(fail_silently=False)


def send_now(to_email, subject, text, html=None):
    """Send one email synchronously. Returns True on success, never raises."""
    try:
        _send(to_email, subject, text, html)
        return True
    except Exception:
        logger.exception("Email to %s failed", to_email)
        return False


def queue_credentials_email(user):
    """Record an activation/credentials email. Replaces any unsent one for the same user."""
    EmailOutbox.objects.filter(
        user=user, kind=EmailOutbox.Kind.ACCOUNT_ACTIVATION, status=EmailOutbox.Status.PENDING
    ).delete()
    return EmailOutbox.objects.create(
        college=user.college,
        user=user,
        kind=EmailOutbox.Kind.ACCOUNT_ACTIVATION,
        to_email=user.email,
    )


def send_after_commit(item_ids):
    """Send these outbox emails once the current transaction commits (within a time budget)."""
    item_ids = list(item_ids)
    if item_ids:
        transaction.on_commit(
            lambda: process_outbox(ids=item_ids, time_budget=settings.EMAIL_SEND_TIME_BUDGET_SECONDS)
        )


def _deliver(item, connection):
    if item.kind == EmailOutbox.Kind.ACCOUNT_ACTIVATION:
        user = item.user
        if user is None or not user.is_active:
            raise RuntimeError("User is missing or inactive; credentials not sent.")
        password = generate_temp_password()
        user.set_password(password)
        user.must_change_password = True
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        subject, text, html = render_email("account_activation", user, password=password)
    else:
        subject, text, html = item.subject, item.body, None

    _send(item.to_email, subject, text, html, connection=connection)


def process_outbox(limit=None, ids=None, time_budget=None):
    """Send pending emails (all, or only `ids`). Safe to run concurrently and repeatedly.

    Must run outside a request transaction: each email gets its own transaction.
    Stops early once `time_budget` seconds have passed; the rest stay PENDING for the job.
    """
    started = time.monotonic()
    sent = failed = 0
    pending = EmailOutbox.objects.filter(status=EmailOutbox.Status.PENDING)
    if ids is not None:
        pending = pending.filter(id__in=ids)
    limit = limit or (len(ids) if ids is not None else settings.EMAIL_BATCH_SIZE)
    pending_ids = list(pending.order_by("created_at").values_list("id", flat=True)[:limit])
    if not pending_ids:
        return {"emails_sent": 0, "emails_failed": 0}

    connection = get_connection()  # one SMTP session for the whole batch
    try:
        for item_id in pending_ids:
            if time_budget is not None and time.monotonic() - started > time_budget:
                break
            with transaction.atomic():
                item = (
                    # lock only the outbox row: Postgres can't lock the nullable side of the user join
                    EmailOutbox.objects.select_for_update(skip_locked=True, of=("self",))
                    .select_related("user__college")
                    .filter(id=item_id, status=EmailOutbox.Status.PENDING)
                    .first()
                )
                if item is None:
                    continue
                try:
                    # savepoint: if sending fails, the new password is rolled back too
                    with transaction.atomic():
                        _deliver(item, connection)
                    item.status = EmailOutbox.Status.SENT
                    item.sent_at = timezone.now()
                    item.last_error = ""
                    sent += 1
                except Exception as exc:
                    logger.warning("Outbox email %s failed: %s", item.id, exc)
                    item.attempts += 1
                    item.last_error = str(exc)[:2000]
                    if item.attempts >= settings.EMAIL_MAX_ATTEMPTS or isinstance(exc, RuntimeError):
                        item.status = EmailOutbox.Status.FAILED
                    failed += 1
                item.save()
    finally:
        try:
            connection.close()
        except Exception:
            pass

    return {"emails_sent": sent, "emails_failed": failed}
