import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def ensure_super_admin(stdout=None):
    """Create the Super Admin from env vars if missing. Never overwrites an existing password."""
    from .models import User

    email = (settings.SUPER_ADMIN_EMAIL or "").strip().lower()
    password = settings.SUPER_ADMIN_PASSWORD
    if not email or not password:
        logger.warning("SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set; Super Admin not ensured.")
        return None

    user = User.objects.filter(email=email).first()
    if user is None:
        user = User.objects.create_superuser(email=email, name=settings.SUPER_ADMIN_NAME, password=password)
        logger.info("Super Admin %s created.", email)
        return user

    if user.role != User.Role.SUPER_ADMIN:
        logger.error("SUPER_ADMIN_EMAIL %s belongs to a %s account; not changed.", email, user.role)
        return None

    if user.status != User.Status.ACTIVE:
        user.status = User.Status.ACTIVE
        user.save(update_fields=["status", "updated_at"])
        logger.info("Super Admin %s re-activated.", email)
    return user


def ensure_super_admin_after_migrate(sender, **kwargs):
    ensure_super_admin()
