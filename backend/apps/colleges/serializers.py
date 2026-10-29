import re

from rest_framework import serializers

from apps.accounts.models import User
from apps.common.exceptions import Conflict
from apps.common.serializers import LowerEmailField, PhoneField, UpperCodeField, UserBriefSerializer

from .models import College, CollegeSettings


class CollegeAdminSerializer(serializers.ModelSerializer):
    email = LowerEmailField(max_length=255)
    phone = PhoneField()

    class Meta:
        model = User
        fields = [
            "id", "name", "email", "phone", "status", "must_change_password",
            "activated_at", "last_login_at", "created_at", "updated_at",
        ]
        read_only_fields = ["status", "must_change_password", "activated_at", "last_login_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["email"].read_only = True


class CollegeAdminBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "name", "email", "status"]


class CollegeSerializer(serializers.ModelSerializer):
    code = UpperCodeField(max_length=50, min_length=2)
    contact_email = LowerEmailField(max_length=255, required=False, allow_blank=True)
    contact_phone = PhoneField()
    admin = serializers.SerializerMethodField()

    class Meta:
        model = College
        fields = [
            "id", "name", "code", "status", "contact_email", "contact_phone", "address",
            "admin", "created_at", "updated_at",
        ]
        read_only_fields = ["status"]

    def get_admin(self, college) -> dict | None:
        admins = getattr(college, "admins", None)
        if admins is None:
            admins = list(college.users.filter(role=User.Role.ADMIN))
        return CollegeAdminBriefSerializer(admins[0]).data if admins else None

    def validate_code(self, value):
        if not re.fullmatch(r"[A-Z0-9-]{2,50}", value):
            raise serializers.ValidationError("Use 2–50 letters, digits or hyphens.")
        qs = College.objects.filter(code=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise Conflict("A college with this code already exists.", {"code": ["A college with this code already exists."]})
        return value

    def create(self, validated_data):
        college = College.objects.create(**validated_data)
        CollegeSettings.objects.create(college=college)
        return college


class PlatformCollegeSerializer(CollegeSerializer):
    stats = serializers.SerializerMethodField()

    class Meta(CollegeSerializer.Meta):
        fields = CollegeSerializer.Meta.fields + ["stats"]

    def get_stats(self, college) -> dict:
        # counts are annotated by PlatformCollegeViewSet.get_queryset()
        return {
            "faculty": college.faculty_count,
            "students": college.student_count,
            "semesters": college.semester_count,
        }


class PublicCollegeSerializer(CollegeSerializer):
    """GET /college/ for faculty and students: no admin details."""

    class Meta(CollegeSerializer.Meta):
        fields = [f for f in CollegeSerializer.Meta.fields if f != "admin"]


class CollegeSettingsSerializer(serializers.ModelSerializer):
    updated_by = UserBriefSerializer(read_only=True)
    min_team_size = serializers.IntegerField(min_value=2, max_value=20, required=False)
    max_team_size = serializers.IntegerField(min_value=2, max_value=20, required=False)
    default_mentor_capacity = serializers.IntegerField(min_value=1, max_value=100, required=False)

    class Meta:
        model = CollegeSettings
        fields = [
            "min_team_size", "max_team_size", "default_mentor_capacity", "team_formation_enabled",
            "teams_locked", "teams_locked_at", "allow_cross_section_evaluation", "updated_by", "updated_at",
        ]
        read_only_fields = ["teams_locked_at", "updated_at"]

    def validate(self, attrs):
        min_size = attrs.get("min_team_size", self.instance.min_team_size)
        max_size = attrs.get("max_team_size", self.instance.max_team_size)
        if max_size < min_size:
            raise serializers.ValidationError(
                {"max_team_size": ["Maximum team size must be at least the minimum team size."]}
            )
        return attrs
