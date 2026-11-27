from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.common import choices
from apps.common.models import BaseModel


class SemesterMentor(BaseModel):
    """Faculty allowed to mentor teams of a semester, and how many teams each may take.

    The capacity counts teams across all subjects of that semester.
    """

    semester = models.ForeignKey("academics.Semester", on_delete=models.CASCADE, related_name="mentors")
    faculty = models.ForeignKey("accounts.Faculty", on_delete=models.CASCADE, related_name="mentor_slots")
    capacity = models.PositiveSmallIntegerField()
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "semester_mentors"
        ordering = ["semester__semester_number", "faculty__user__name"]
        constraints = [
            models.UniqueConstraint(fields=["semester", "faculty"], name="uq_semester_mentor"),
            models.CheckConstraint(condition=Q(capacity__gte=1), name="ck_semester_mentor_capacity_gte_1"),
        ]

    def __str__(self):
        return f"{self.faculty} — {self.semester} (cap {self.capacity})"


class Team(BaseModel):
    """A project team of one semester-subject. The lead is also one of its members."""

    semester_subject = models.ForeignKey(
        "academics.SemesterSubject", on_delete=models.CASCADE, related_name="teams"
    )
    # Set by the team's evaluator or the Admin, never by students
    name = models.CharField(max_length=100, blank=True)
    name_set_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    name_set_at = models.DateTimeField(null=True, blank=True)
    # Submitted by the team in the subject's first phase (the project phase)
    project_title = models.CharField(max_length=200, blank=True)
    project_description = models.TextField(blank=True)
    # RESTRICT: a Team Lead can't be deleted while leading (change the lead first);
    # deleting the whole offering / college still removes the team.
    lead = models.ForeignKey("accounts.Student", on_delete=models.RESTRICT, related_name="led_teams")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        db_table = "teams"
        ordering = ["semester_subject_id", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["semester_subject", "name"], condition=~Q(name=""), name="uq_team_name_per_offering"
            ),
        ]
        indexes = [models.Index(fields=["lead"])]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self):
        return self.name or f"Team #{self.pk}"


class TeamMember(BaseModel):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="members")
    student = models.ForeignKey("accounts.Student", on_delete=models.CASCADE, related_name="team_memberships")
    # Copy of team.semester_subject so the database can enforce one team per student per offering
    semester_subject = models.ForeignKey(
        "academics.SemesterSubject", on_delete=models.CASCADE, related_name="+"
    )

    class Meta:
        db_table = "team_members"
        ordering = ["team_id", "id"]
        constraints = [
            models.UniqueConstraint(fields=["student", "semester_subject"], name="uq_one_team_per_student_offering"),
        ]
        indexes = [models.Index(fields=["team"])]

    def __str__(self):
        return f"{self.student} in {self.team}"


class TeamInvite(BaseModel):
    """The Team Lead invites an eligible student; the student accepts or declines."""

    Status = choices.InviteStatus

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="invites")
    student = models.ForeignKey("accounts.Student", on_delete=models.CASCADE, related_name="team_invites")
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    responded_at = models.DateTimeField(null=True, blank=True)
    # True when cancelled by the system because the student joined another team for the subject
    is_automatic = models.BooleanField(default=False)

    class Meta:
        db_table = "team_invites"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "student"], condition=Q(status="PENDING"), name="uq_pending_invite_per_team_student"
            ),
        ]
        indexes = [models.Index(fields=["student", "status"])]


class MentorAssignment(BaseModel):
    """A team's mentor request (PENDING → ACCEPTED/REJECTED) or an Admin assignment.

    Only ACCEPTED rows use the mentor's semester capacity; reaching it auto-rejects the rest.
    """

    Status = choices.MentorStatus

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="mentor_assignments")
    faculty = models.ForeignKey("accounts.Faculty", on_delete=models.CASCADE, related_name="mentor_assignments")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Admin who assigned/removed it directly (empty for normal student requests)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=500, blank=True)
    # True when the system rejected it because the mentor filled up
    is_automatic = models.BooleanField(default=False)

    class Meta:
        db_table = "mentor_assignments"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["team", "faculty"],
                condition=Q(status__in=["PENDING", "ACCEPTED"]),
                name="uq_active_mentor_per_team_faculty",
            ),
        ]
        indexes = [models.Index(fields=["faculty", "status"]), models.Index(fields=["team", "status"])]

    def __str__(self):
        return f"{self.faculty} → {self.team} ({self.status})"
