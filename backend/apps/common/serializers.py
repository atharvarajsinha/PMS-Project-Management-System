import re

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

_PHONE_STRIP = re.compile(r"[\s\-()]")
_PHONE_VALID = re.compile(r"^\+?\d{7,15}$")


class PhoneField(serializers.CharField):
    """Optional phone: strips spaces/dashes/brackets, then digits with optional leading +.
    `null` and "" both mean "no phone" and are stored as ""."""

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("allow_null", True)
        kwargs.setdefault("max_length", 30)
        super().__init__(**kwargs)

    def validate_empty_values(self, data):
        if data is None:
            return True, ""  # column is NOT NULL; store "no phone" as ""
        return super().validate_empty_values(data)

    def to_internal_value(self, data):
        value = _PHONE_STRIP.sub("", super().to_internal_value(data))
        if value and not _PHONE_VALID.match(value):
            raise serializers.ValidationError("Enter a valid phone number.")
        return value


class LowerEmailField(serializers.EmailField):
    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().lower()


class UpperCodeField(serializers.CharField):
    def to_internal_value(self, data):
        return super().to_internal_value(data).strip().upper()


@extend_schema_field(OpenApiTypes.INT)
class CollegeScopedPKField(serializers.PrimaryKeyRelatedField):
    """PK field whose queryset is limited to the request's college.

    `scope` receives the college and returns the queryset, e.g.
    `CollegeScopedPKField(scope=lambda c: Section.objects.filter(semester__college=c))`.
    Ids from another college behave exactly like ids that don't exist.
    """

    def __init__(self, scope, **kwargs):
        self.scope = scope
        super().__init__(**kwargs)

    def get_queryset(self):
        return self.scope(self.context["college"])


class UserBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    email = serializers.EmailField()


class FacultyBriefSerializer(serializers.Serializer):
    """Faculty as {id, name, email} where id is the faculty id."""

    id = serializers.IntegerField()
    name = serializers.CharField(source="user.name")
    email = serializers.EmailField(source="user.email")


class SemesterBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    semester_number = serializers.IntegerField()


class SectionBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class SubjectBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    code = serializers.CharField()
    name = serializers.CharField()


class BulkIdsSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=500)
