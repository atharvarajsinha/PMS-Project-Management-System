"""Keep AUTO evaluator assignments in step with section-subject faculty changes.

A signal (not a call in each view) so every path that assigns faculty is covered:
the mapping API, the mapping grid's bulk create, CSV import and the Django shell.
"""

from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.academics.models import SectionSubject

from . import services


@receiver(post_save, sender=SectionSubject, dispatch_uid="evaluations_sync_section_subject")
def section_subject_saved(sender, instance, created, raw=False, **kwargs):
    if raw:  # loaddata
        return
    services.sync_section_subject(instance)
