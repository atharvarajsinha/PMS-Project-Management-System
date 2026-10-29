from django.core.management.base import BaseCommand

from apps.accounts.bootstrap import ensure_super_admin


class Command(BaseCommand):
    help = "Create the Super Admin from SUPER_ADMIN_* env vars if it does not exist (also runs after every migrate)."

    def handle(self, *args, **options):
        user = ensure_super_admin()
        if user:
            self.stdout.write(self.style.SUCCESS(f"Super Admin ready: {user.email}"))
        else:
            self.stdout.write(self.style.WARNING("Super Admin not ensured; check SUPER_ADMIN_* settings and logs."))
