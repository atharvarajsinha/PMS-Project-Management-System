from django.db.models import Prefetch
from rest_framework import serializers

from apps.common.serializers import FacultyBriefSerializer
from apps.projects.models import PhaseSubmission
from apps.projects.serializers import SubmissionSerializer
from apps.teams.models import TeamMember
from apps.teams.serializers import OfferingBriefSerializer, PhaseBriefSerializer, StudentBriefSerializer

from .models import Evaluation, EvaluatorAssignment, StudentMark


def assignment_queryset():
    return EvaluatorAssignment.objects.select_related(
        "phase__semester_subject__semester",
        "phase__semester_subject__subject",
        "team__lead__user",
        "team__lead__section",
        "evaluator__user",
        "evaluation__evaluated_by__user",
        "evaluation__updated_by",
    ).prefetch_related(
        Prefetch("team__members", queryset=TeamMember.objects.select_related("student__user", "student__section").order_by("id")),
        Prefetch("evaluation__student_marks", queryset=StudentMark.objects.select_related("student__user")),
    )


def submissions_for(assignments):
    """{(team_id, phase_id): PhaseSubmission} for a page of assignments, in two queries."""
    pairs = {(a.team_id, a.phase_id) for a in assignments}
    if not pairs:
        return {}
    team_ids = {t for t, _ in pairs}
    phase_ids = {p for _, p in pairs}
    subs = (
        PhaseSubmission.objects.filter(team_id__in=team_ids, phase_id__in=phase_ids)
        .select_related("submitted_by__user")
        .prefetch_related("links")
    )
    return {(s.team_id, s.phase_id): s for s in subs}


class StudentMarkSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField()
    name = serializers.CharField(source="student.user.name")
    roll_number = serializers.CharField(source="student.roll_number")

    class Meta:
        model = StudentMark
        fields = ["student_id", "name", "roll_number", "marks"]


class EvaluationSerializer(serializers.ModelSerializer):
    """Marks are per student; `default_marks` is the "same for everyone" value; `summary` = min/max/avg."""

    evaluated_by = FacultyBriefSerializer(allow_null=True)
    student_marks = StudentMarkSerializer(many=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = Evaluation
        fields = [
            "default_marks", "max_marks", "student_marks", "summary", "remarks", "status", "submitted_at",
            "evaluated_by", "updated_at",
        ]

    def get_summary(self, e) -> dict | None:
        values = [m.marks for m in e.student_marks.all()]
        if not values:
            return None
        avg = sum(values) / len(values)
        return {"min": f"{min(values):.2f}", "max": f"{max(values):.2f}", "avg": f"{avg:.2f}"}


class AssignmentSerializer(serializers.ModelSerializer):
    """One team in one phase, for its evaluator or the Admin. Includes marks — never shown to students."""

    phase = PhaseBriefSerializer()
    semester_subject = serializers.SerializerMethodField()
    team = serializers.SerializerMethodField()
    evaluator = FacultyBriefSerializer(allow_null=True)
    submission = serializers.SerializerMethodField()
    evaluation = serializers.SerializerMethodField()
    max_marks = serializers.DecimalField(source="phase.max_marks", max_digits=6, decimal_places=2)
    can_edit_marks = serializers.SerializerMethodField()

    class Meta:
        model = EvaluatorAssignment
        fields = [
            "id", "phase", "semester_subject", "team", "evaluator", "source", "submission", "evaluation",
            "max_marks", "can_edit_marks",
        ]

    def get_semester_subject(self, a) -> dict:
        return OfferingBriefSerializer(a.phase.semester_subject).data

    def get_team(self, a) -> dict:
        team = a.team
        return {
            "id": team.id,
            "name": team.name,
            "display_name": team.display_name,
            "project_title": team.project_title,
            "project_description": team.project_description,
            "lead_id": team.lead_id,
            "members": [StudentBriefSerializer(m.student).data for m in team.members.all()],
        }

    def get_submission(self, a) -> dict | None:
        sub = self.context.get("submissions", {}).get((a.team_id, a.phase_id))
        return SubmissionSerializer(sub).data if sub else None

    def get_evaluation(self, a) -> dict | None:
        evaluation = getattr(a, "evaluation", None)
        return EvaluationSerializer(evaluation).data if evaluation else None

    def get_can_edit_marks(self, a) -> bool:
        return a.phase.accepts_marks()


class StudentMarkInputSerializer(serializers.Serializer):
    student_id = serializers.IntegerField(min_value=1)
    marks = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)


class MarksSerializer(serializers.Serializer):
    """`default_marks` applies to every member; `student_marks` overrides it per student."""

    default_marks = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0, required=False, allow_null=True)
    student_marks = StudentMarkInputSerializer(many=True, required=False, max_length=50)
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=5000)
    submit = serializers.BooleanField(default=True)

    def validate(self, attrs):
        if attrs.get("default_marks") is None and not attrs.get("student_marks"):
            raise serializers.ValidationError({"default_marks": ["Enter a mark for everyone or per student."]})
        attrs["student_marks"] = {row["student_id"]: row["marks"] for row in attrs.get("student_marks", [])}
        return attrs


class TeamNameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, allow_blank=True)
