from django.apps import AppConfig
from django.db.models.signals import post_migrate


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    label = "accounts"

    def ready(self):
        from .bootstrap import ensure_super_admin_after_migrate

        # `migrate` runs on every server start (Render start command), so the
        # Super Admin is ensured each time the server starts.
        post_migrate.connect(ensure_super_admin_after_migrate, sender=self)
