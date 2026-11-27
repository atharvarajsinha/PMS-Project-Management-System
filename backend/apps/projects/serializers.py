from decimal import Decimal

from rest_framework import serializers

from apps.academics.models import SemesterSubject
from apps.common.choices import LinkType
from apps.common.serializers import CollegeScopedPKField, UserBriefSerializer

from .models import Phase, PhaseSubmission, SubmissionLink


class SubmissionLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubmissionLink
        fields = ["id", "link_type", "url", "title"]


class SubmissionSerializer(serializers.ModelSerializer):
    links = SubmissionLinkSerializer(many=True, read_only=True)
    submitted_by = serializers.SerializerMethodField()

    class Meta:
        model = PhaseSubmission
        fields = ["id", "phase_id", "team_id", "status", "notes", "links", "submitted_by", "submitted_at", "updated_at"]

    def get_submitted_by(self, sub) -> dict | None:
        if sub.submitted_by_id is None:
            return None
        return {"id": sub.submitted_by_id, "name": sub.submitted_by.user.name}


class LinkInputSerializer(serializers.Serializer):
    link_type = serializers.ChoiceField(choices=LinkType.choices, default=LinkType.OTHER)
    url = serializers.URLField(max_length=1000)
    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")

    def validate_url(self, value):
        if not value.lower().startswith(("http://", "https://")):
            raise serializers.ValidationError("Use a full http(s) link.")
        return value


class SubmissionWriteSerializer(serializers.Serializer):
    links = LinkInputSerializer(many=True, max_length=20, required=False, default=list)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    submit = serializers.BooleanField(default=True)
    # Project phase (the subject's first phase) only; ignored for other phases
    project_title = serializers.CharField(required=False, allow_blank=True, max_length=200)
    project_description = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    team_name = serializers.CharField(required=False, allow_blank=True, max_length=100)


def first_phase_id(context, semester_subject_id):
    """Id of the subject's first phase, cached in the serializer context for list pages."""
    cache = context.setdefault("_first_phase_ids", {}) if isinstance(context, dict) else {}
    if semester_subject_id not in cache:
        cache[semester_subject_id] = Phase.first_phase_ids([semester_subject_id]).get(semester_subject_id)
    return cache[semester_subject_id]


def college_offerings(college):
    return SemesterSubject.objects.filter(semester__college=college)


class PhaseSerializer(serializers.ModelSerializer):
    semester_subject_id = CollegeScopedPKField(scope=college_offerings, source="semester_subject")
    semester_subject = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    locked_by = UserBriefSerializer(read_only=True, allow_null=True)
    max_marks = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=Decimal("0"))
    order = serializers.IntegerField(read_only=True)
    is_project_phase = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta:
        model = Phase
        fields = [
            "id", "semester_subject_id", "semester_subject", "name", "short_description", "description",
            "start_date", "end_date", "evaluation_end_date", "max_marks", "order", "is_project_phase", "status",
            "locked_at", "locked_by", "unlocked_at", "stats", "created_at", "updated_at",
        ]
        read_only_fields = ["locked_at", "unlocked_at"]

    def get_semester_subject(self, phase) -> dict:
        ss = phase.semester_subject
        return {
            "id": ss.id,
            "semester": {"id": ss.semester_id, "semester_number": ss.semester.semester_number},
            "subject": {"id": ss.subject_id, "code": ss.subject.code, "name": ss.subject.name},
        }

    def get_status(self, phase) -> str:
        return phase.effective_status()

    def get_is_project_phase(self, phase) -> bool:
        return first_phase_id(self.context, phase.semester_subject_id) == phase.pk

    def get_stats(self, phase) -> dict | None:
        keys = ("teams_count", "submitted_count", "evaluated_count", "evaluator_pending_count")
        if not hasattr(phase, "teams_count"):
            return None
        return {k: getattr(phase, k) for k in keys}

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and "semester_subject" in attrs and attrs["semester_subject"] != instance.semester_subject:
            raise serializers.ValidationError({"semester_subject_id": ["A phase can't be moved to another subject."]})

        def pick(field):
            return attrs.get(field, getattr(instance, field, None))

        start, end, eval_end = pick("start_date"), pick("end_date"), pick("evaluation_end_date")
        errors = {}
        if start and end and end <= start:
            errors["end_date"] = ["End date must be after the start date."]
        if eval_end and end and eval_end < end:
            errors["evaluation_end_date"] = ["Evaluation end date can't be before the end date."]
        if instance is not None and "max_marks" in attrs:
            from apps.evaluations.models import StudentMark

            highest = (
                StudentMark.objects.filter(evaluation__assignment__phase=instance)
                .order_by("-marks")
                .values_list("marks", flat=True)
                .first()
            )
            if highest is not None and attrs["max_marks"] < highest:
                errors["max_marks"] = [f"Marks of up to {highest:g} were already given; max marks can't be lower."]
        if errors:
            raise serializers.ValidationError(errors)
        return attrs


class ReorderSerializer(serializers.Serializer):
    semester_subject_id = serializers.IntegerField(min_value=1)
    ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=50)
