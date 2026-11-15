from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.common import choices
from apps.common.models import BaseModel


class EvaluatorAssignment(BaseModel):
    """Who evaluates a team in a phase. Exactly one row per team per phase.

    `evaluator` is empty while the section-subject of the Team Lead's section has no
    faculty yet ("evaluator pending"). AUTO rows follow the default rule
    (faculty of subject + Team Lead's section); ADMIN_OVERRIDE rows are left alone.
    """

    Source = choices.EvaluatorSource

    team = models.ForeignKey("teams.Team", on_delete=models.CASCADE, related_name="evaluator_assignments")
    phase = models.ForeignKey("projects.Phase", on_delete=models.CASCADE, related_name="evaluator_assignments")
    evaluator = models.ForeignKey(
        "accounts.Faculty", null=True, blank=True, on_delete=models.SET_NULL, related_name="evaluator_assignments"
    )
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.AUTO)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "evaluator_assignments"
        ordering = ["phase__order", "phase__start_date", "team_id"]
        constraints = [models.UniqueConstraint(fields=["team", "phase"], name="uq_evaluator_per_team_phase")]
        indexes = [models.Index(fields=["evaluator", "phase"])]

    def __str__(self):
        return f"{self.team} / {self.phase} → {self.evaluator}"


class Evaluation(BaseModel):
    """One team's evaluation for one phase. Marks are per student (StudentMark).

    Exists even without a submission (then every member gets 0). `default_marks` is the
    "same for everyone" value the evaluator typed; individual students may differ from it.
    """

    Status = choices.EvaluationStatus

    assignment = models.OneToOneField(EvaluatorAssignment, on_delete=models.CASCADE, related_name="evaluation")
    submission = models.ForeignKey(
        "projects.PhaseSubmission", null=True, blank=True, on_delete=models.SET_NULL, related_name="evaluations"
    )
    evaluated_by = models.ForeignKey(
        "accounts.Faculty", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    default_marks = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    max_marks = models.DecimalField(max_digits=6, decimal_places=2)  # snapshot of the phase's max at entry time
    remarks = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    submitted_at = models.DateTimeField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "evaluations"
        constraints = [
            models.CheckConstraint(
                condition=Q(default_marks__isnull=True) | (Q(default_marks__gte=0) & Q(default_marks__lte=F("max_marks"))),
                name="ck_evaluation_default_marks_range",
            ),
        ]

    def __str__(self):
        return f"Evaluation of {self.assignment}"


class StudentMark(BaseModel):
    """Marks of one team member in one evaluation (0..evaluation.max_marks, checked on save)."""

    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="student_marks")
    student = models.ForeignKey("accounts.Student", on_delete=models.CASCADE, related_name="marks")
    marks = models.DecimalField(max_digits=6, decimal_places=2)

    class Meta:
        db_table = "student_marks"
        ordering = ["evaluation_id", "student__roll_number"]
        constraints = [
            models.UniqueConstraint(fields=["evaluation", "student"], name="uq_student_mark_per_evaluation"),
            models.CheckConstraint(condition=Q(marks__gte=0), name="ck_student_mark_gte_0"),
        ]

    def __str__(self):
        return f"{self.student}: {self.marks}"
