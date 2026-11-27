from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.common import choices
from apps.common.models import BaseModel


class College(BaseModel):
    Status = choices.CollegeStatus

    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    contact_email = models.EmailField(max_length=255, blank=True)
    contact_phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)

    class Meta:
        db_table = "colleges"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE


class CollegeSettings(BaseModel):
    college = models.OneToOneField(College, on_delete=models.CASCADE, related_name="settings")
    min_team_size = models.PositiveSmallIntegerField(default=2)
    max_team_size = models.PositiveSmallIntegerField(default=4)
    default_mentor_capacity = models.PositiveSmallIntegerField(default=5)
    # One switch for the Admin: team formation open. Closing it locks every team (teams_locked is
    # kept in step by the settings API); "never opened" is formation off and not locked.
    team_formation_enabled = models.BooleanField(default=False)
    teams_locked = models.BooleanField(default=False)
    teams_locked_at = models.DateTimeField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "college_settings"
        constraints = [
            models.CheckConstraint(condition=Q(min_team_size__gte=2), name="ck_min_team_size_gte_2"),
            models.CheckConstraint(condition=Q(max_team_size__gte=F("min_team_size")), name="ck_max_gte_min_team_size"),
            models.CheckConstraint(condition=Q(default_mentor_capacity__gte=1), name="ck_mentor_capacity_gte_1"),
        ]

    def __str__(self):
        return f"Settings for {self.college_id}"
