from django.core.management.base import BaseCommand

from apps.common.emails import process_outbox


class Command(BaseCommand):
    help = "Send pending emails from the outbox (same as GET /api/v1/jobs/run/)."

    def handle(self, *args, **options):
        self.stdout.write(str(process_outbox()))
