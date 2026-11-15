from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.db import models
from django.db.models import Q

from apps.common import choices
from apps.common.models import BaseModel


class UserManager(BaseUserManager):
    def create_user(self, email, name, role, password=None, **extra):
        user = self.model(email=self.normalize_email(email).lower(), name=name, role=role, **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, name="Super Admin", password=None, **extra):
        extra.setdefault("status", User.Status.ACTIVE)
        extra.setdefault("must_change_password", False)
        return self.create_user(email, name, User.Role.SUPER_ADMIN, password, **extra)


class User(AbstractBaseUser, BaseModel):
    Role = choices.Role
    Status = choices.AccountStatus

    last_login = None  # replaced by last_login_at

    college = models.ForeignKey(
        "colleges.College", null=True, blank=True, on_delete=models.CASCADE, related_name="users"
    )
    email = models.EmailField(max_length=255, unique=True)
    role = models.CharField(max_length=20, choices=Role.choices)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.INACTIVE)
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=30, blank=True)
    must_change_password = models.BooleanField(default=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["name"]

    class Meta:
        db_table = "users"
        ordering = ["name"]
        indexes = [models.Index(fields=["college", "role"])]
        constraints = [
            models.CheckConstraint(
                condition=(Q(role="SUPER_ADMIN") & Q(college__isnull=True))
                | (~Q(role="SUPER_ADMIN") & Q(college__isnull=False)),
                name="ck_user_college_matches_role",
            ),
            models.UniqueConstraint(
                fields=["college"], condition=Q(role="ADMIN"), name="uq_one_admin_per_college"
            ),
        ]

    def __str__(self):
        return f"{self.name} <{self.email}>"

    def save(self, *args, **kwargs):
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE

    @property
    def college_is_active(self):
        return self.college is None or self.college.is_active


class Faculty(BaseModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="faculty")
    college = models.ForeignKey("colleges.College", on_delete=models.CASCADE, related_name="faculty")

    class Meta:
        db_table = "faculty"
        verbose_name_plural = "faculty"
        indexes = [models.Index(fields=["college"])]

    def __str__(self):
        return self.user.name


class Student(BaseModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="student")
    college = models.ForeignKey("colleges.College", on_delete=models.CASCADE, related_name="students")
    roll_number = models.CharField(max_length=100)
    # RESTRICT: a section with students can't be deleted on its own,
    # but deleting the whole college still works.
    section = models.ForeignKey("academics.Section", on_delete=models.RESTRICT, related_name="students")

    class Meta:
        db_table = "students"
        indexes = [models.Index(fields=["section"])]
        constraints = [
            models.UniqueConstraint(fields=["college", "roll_number"], name="uq_roll_number_per_college"),
        ]

    def __str__(self):
        return f"{self.roll_number} {self.user.name}"


class PasswordResetOTP(models.Model):
    Purpose = choices.OtpPurpose

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_reset_otps")
    purpose = models.CharField(max_length=20, choices=Purpose.choices, default=Purpose.PASSWORD_RESET)
    otp_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "password_reset_otps"
        indexes = [models.Index(fields=["user", "purpose"])]
