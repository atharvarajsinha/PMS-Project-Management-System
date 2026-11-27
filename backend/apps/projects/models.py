from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from django.db import models
from django.db.models import F, Func, Q, Value
from django.utils import timezone

from apps.common import choices
from apps.common.models import BaseModel


class DateRange(Func):
    """daterange(start, end, '[]') — both days inclusive."""

    function = "DATERANGE"
    output_field = DateRangeField()


class Phase(BaseModel):
    """A project phase of one semester-subject, shared by all its sections.

    Dates are calendar days in settings.TIME_ZONE and both ends are inclusive:
    submissions are open from `start_date` through `end_date`; evaluation runs
    from the day after `end_date` until the phase is locked (by the Admin, or
    automatically once `evaluation_end_date` has passed).
    """

    Status = choices.PhaseStatus

    semester_subject = models.ForeignKey(
        "academics.SemesterSubject", on_delete=models.CASCADE, related_name="phases"
    )
    name = models.CharField(max_length=150)
    short_description = models.CharField(max_length=300, blank=True)
    description = models.TextField(blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    evaluation_end_date = models.DateField(null=True, blank=True)
    max_marks = models.DecimalField(max_digits=6, decimal_places=2)
    order = models.PositiveSmallIntegerField(default=0)
    # Kept current by the job and by every write; checks still use the dates (see effective_status)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.UPCOMING)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Set when the Admin unlocks for corrections: stops the job from re-locking it at evaluation_end_date
    unlocked_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "phases"
        ordering = ["semester_subject_id", "order", "start_date"]
        constraints = [
            models.UniqueConstraint(fields=["semester_subject", "name"], name="uq_phase_name_per_offering"),
            models.CheckConstraint(condition=Q(end_date__gt=F("start_date")), name="ck_phase_end_after_start"),
            models.CheckConstraint(
                condition=Q(evaluation_end_date__isnull=True) | Q(evaluation_end_date__gte=F("end_date")),
                name="ck_phase_eval_end_gte_end",
            ),
            models.CheckConstraint(condition=Q(max_marks__gte=0), name="ck_phase_max_marks_gte_0"),
            ExclusionConstraint(
                name="ex_phase_no_overlap",
                expressions=[
                    ("semester_subject", RangeOperators.EQUAL),
                    (DateRange("start_date", "end_date", Value("[]")), RangeOperators.OVERLAPS),
                ],
            ),
        ]

    def __str__(self):
        return self.name

    # ------------------------------------------------------------ project phase
    @staticmethod
    def first_phase_ids(semester_subject_ids):
        """{semester_subject_id: id of its first phase}. The first phase is always the project phase."""
        firsts = {}
        rows = (
            Phase.objects.filter(semester_subject_id__in=set(semester_subject_ids))
            .order_by("semester_subject_id", "order", "start_date", "id")
            .values_list("semester_subject_id", "id")
        )
        for ss_id, phase_id in rows:
            firsts.setdefault(ss_id, phase_id)
        return firsts

    @property
    def is_project_phase(self):
        """Phase 1 of a subject: students submit the project title and description (links optional)."""
        return Phase.first_phase_ids([self.semester_subject_id]).get(self.semester_subject_id) == self.pk

    # ------------------------------------------------------------ status
    @property
    def is_locked(self):
        return self.locked_at is not None

    def effective_status(self, today=None):
        if self.locked_at:
            return self.Status.LOCKED
        today = today or timezone.localdate()
        if today < self.start_date:
            return self.Status.UPCOMING
        if today <= self.end_date:
            return self.Status.OPEN
        return self.Status.CLOSED

    def accepts_submissions(self, today=None):
        return self.effective_status(today) == self.Status.OPEN

    def accepts_marks(self, today=None):
        return self.effective_status(today) == self.Status.CLOSED

    def due_for_auto_lock(self, today=None):
        today = today or timezone.localdate()
        return (
            self.locked_at is None
            and self.unlocked_at is None
            and self.evaluation_end_date is not None
            and today > self.evaluation_end_date
        )


class PhaseSubmission(BaseModel):
    """One per team per phase; its links are in SubmissionLink."""

    Status = choices.SubmissionStatus

    team = models.ForeignKey("teams.Team", on_delete=models.CASCADE, related_name="submissions")
    phase = models.ForeignKey(Phase, on_delete=models.CASCADE, related_name="submissions")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    submitted_by = models.ForeignKey(
        "accounts.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    last_edited_by = models.ForeignKey(
        "accounts.Student", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "phase_submissions"
        constraints = [models.UniqueConstraint(fields=["team", "phase"], name="uq_submission_per_team_phase")]
        indexes = [models.Index(fields=["phase", "status"])]

    def __str__(self):
        return f"{self.team} — {self.phase} ({self.status})"

    @property
    def is_submitted(self):
        return self.status == self.Status.SUBMITTED


class SubmissionLink(BaseModel):
    Type = choices.LinkType

    submission = models.ForeignKey(PhaseSubmission, on_delete=models.CASCADE, related_name="links")
    link_type = models.CharField(max_length=20, choices=Type.choices, default=Type.OTHER)
    url = models.URLField(max_length=1000)
    title = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "submission_links"
        ordering = ["id"]

    def __str__(self):
        return self.url
