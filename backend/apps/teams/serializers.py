from django.db.models import Count, Prefetch
from rest_framework import serializers

from apps.accounts.models import Faculty, Student
from apps.academics.models import SemesterSubject
from apps.common.choices import MENTOR_ACTIVE_STATUSES, TeamRole
from apps.common.serializers import CollegeScopedPKField, FacultyBriefSerializer
from apps.evaluations.models import EvaluatorAssignment
from apps.projects.models import Phase

from .models import MentorAssignment, SemesterMentor, Team, TeamInvite, TeamMember


# ---------------------------------------------------------------- scopes


def college_students(college):
    return Student.objects.filter(college=college).select_related("user", "section__semester")


def college_active_faculty(college):
    return Faculty.objects.filter(college=college).select_related("user")


def college_offerings(college):
    return SemesterSubject.objects.filter(semester__college=college).select_related("semester", "subject")


def team_queryset():
    """Everything TeamSerializer reads, in a fixed number of queries."""
    return (
        Team.objects.select_related("semester_subject__semester", "semester_subject__subject", "lead__user", "name_set_by")
        .prefetch_related(
            Prefetch(
                "members",
                queryset=TeamMember.objects.select_related("student__user", "student__section").order_by("id"),
            ),
            Prefetch(
                "mentor_assignments",
                queryset=MentorAssignment.objects.filter(status__in=MENTOR_ACTIVE_STATUSES)
                .select_related("faculty__user")
                .order_by("created_at"),
                to_attr="active_mentors",
            ),
            Prefetch(
                "evaluator_assignments",
                queryset=EvaluatorAssignment.objects.select_related("phase", "evaluator__user").order_by(
                    "phase__order", "phase__start_date"
                ),
            ),
            Prefetch(
                "invites",
                queryset=TeamInvite.objects.filter(status=TeamInvite.Status.PENDING).select_related(
                    "student__user", "student__section"
                ),
                to_attr="pending_invites",
            ),
        )
        .annotate(members_count=Count("members", distinct=True))
    )


# ---------------------------------------------------------------- briefs


class StudentBriefSerializer(serializers.Serializer):
    """Student as {id (student id), name, email, roll_number, section}."""

    id = serializers.IntegerField()
    name = serializers.CharField(source="user.name")
    email = serializers.EmailField(source="user.email")
    roll_number = serializers.CharField()
    section = serializers.SerializerMethodField()

    def get_section(self, student) -> dict:
        return {"id": student.section_id, "name": student.section.name}


class StudentContactSerializer(StudentBriefSerializer):
    """Student brief plus phone: only for people working with the team
    (its members, mentors, evaluators and the admin), never in student search."""

    phone = serializers.CharField(source="user.phone")


class OfferingBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    semester = serializers.SerializerMethodField()
    subject = serializers.SerializerMethodField()

    def get_semester(self, ss) -> dict:
        return {"id": ss.semester_id, "semester_number": ss.semester.semester_number}

    def get_subject(self, ss) -> dict:
        return {"id": ss.subject_id, "code": ss.subject.code, "name": ss.subject.name}


class PhaseBriefSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    order = serializers.IntegerField()
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    evaluation_end_date = serializers.DateField(allow_null=True)
    status = serializers.SerializerMethodField()
    is_project_phase = serializers.SerializerMethodField()

    def get_status(self, phase) -> str:
        return phase.effective_status()

    def get_is_project_phase(self, phase) -> bool:
        from apps.projects.serializers import first_phase_id

        return first_phase_id(self.context, phase.semester_subject_id) == phase.pk


class MentorAssignmentBriefSerializer(serializers.ModelSerializer):
    faculty = FacultyBriefSerializer()

    class Meta:
        model = MentorAssignment
        fields = ["id", "faculty", "status", "note", "is_automatic", "created_at", "decided_at"]


class EvaluatorRowSerializer(serializers.ModelSerializer):
    phase = PhaseBriefSerializer()
    evaluator = FacultyBriefSerializer(allow_null=True)

    class Meta:
        model = EvaluatorAssignment
        fields = ["id", "phase", "evaluator", "source"]


class InviteBriefSerializer(serializers.ModelSerializer):
    student = StudentBriefSerializer()

    class Meta:
        model = TeamInvite
        fields = ["id", "student", "status", "created_at"]


# ---------------------------------------------------------------- team


class TeamSerializer(serializers.ModelSerializer):
    """Full team view. Never includes marks (students see this too)."""

    display_name = serializers.CharField(read_only=True)
    semester_subject = OfferingBriefSerializer(read_only=True)
    lead = StudentContactSerializer(read_only=True)
    members = serializers.SerializerMethodField()
    members_count = serializers.SerializerMethodField()
    is_complete = serializers.SerializerMethodField()
    mentors = serializers.SerializerMethodField()
    evaluators = serializers.SerializerMethodField()
    evaluator_pending = serializers.SerializerMethodField()
    pending_invites = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id", "name", "display_name", "project_title", "project_description", "semester_subject", "lead",
            "members", "members_count", "is_complete",
            "mentors", "evaluators", "evaluator_pending", "pending_invites", "name_set_at", "created_at",
        ]

    def _settings(self):
        return self.context["college"].settings

    def get_members(self, team) -> list:
        return [
            {
                **StudentContactSerializer(m.student).data,
                "role": TeamRole.LEAD if m.student_id == team.lead_id else TeamRole.MEMBER,
                "joined_at": m.created_at,
            }
            for m in team.members.all()
        ]

    def get_members_count(self, team) -> int:
        return len(team.members.all())

    def get_is_complete(self, team) -> bool:
        return len(team.members.all()) >= self._settings().min_team_size

    def get_mentors(self, team) -> list:
        return MentorAssignmentBriefSerializer(getattr(team, "active_mentors", []), many=True).data

    def get_evaluators(self, team) -> list:
        return EvaluatorRowSerializer(team.evaluator_assignments.all(), many=True).data

    def get_evaluator_pending(self, team) -> bool:
        return any(a.evaluator_id is None for a in team.evaluator_assignments.all())

    def get_pending_invites(self, team) -> list:
        if not self.context.get("show_invites", True):
            return []
        return InviteBriefSerializer(getattr(team, "pending_invites", []), many=True).data


class TeamCreateSerializer(serializers.Serializer):
    """Admin creates a team for any eligible students."""

    semester_subject_id = CollegeScopedPKField(scope=college_offerings)
    lead_id = CollegeScopedPKField(scope=college_students)
    member_ids = serializers.ListField(
        child=CollegeScopedPKField(scope=college_students), required=False, default=list, max_length=20
    )


class StudentIdSerializer(serializers.Serializer):
    student_id = CollegeScopedPKField(scope=college_students)


class InviteIdSerializer(serializers.Serializer):
    invite_id = serializers.IntegerField(min_value=1)


class TeamNameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, allow_blank=True)


class TeamEditSerializer(serializers.Serializer):
    """Admin: any of the team's name, project title and project description."""

    name = serializers.CharField(max_length=100, allow_blank=True, required=False)
    project_title = serializers.CharField(max_length=200, allow_blank=True, required=False)
    project_description = serializers.CharField(max_length=5000, allow_blank=True, required=False)


class MentorAssignSerializer(serializers.Serializer):
    faculty_id = CollegeScopedPKField(scope=college_active_faculty)
    replace = serializers.BooleanField(default=True)
    override_capacity = serializers.BooleanField(default=False)


class AssignmentIdSerializer(serializers.Serializer):
    assignment_id = serializers.IntegerField(min_value=1)


class EvaluatorOverrideSerializer(serializers.Serializer):
    evaluator_id = CollegeScopedPKField(scope=college_active_faculty, allow_null=True)
    phase_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)


class MentorRequestSerializer(serializers.Serializer):
    faculty_id = CollegeScopedPKField(scope=college_active_faculty)


class DecisionSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


# ---------------------------------------------------------------- mentor list


class SemesterMentorSerializer(serializers.ModelSerializer):
    semester_id = serializers.PrimaryKeyRelatedField(source="semester", read_only=True)
    faculty = FacultyBriefSerializer(read_only=True)
    faculty_status = serializers.CharField(source="faculty.user.status", read_only=True)
    load = serializers.IntegerField(read_only=True, default=0)  # accepted teams (uses capacity)
    accepted = serializers.IntegerField(read_only=True, default=0)
    pending = serializers.IntegerField(read_only=True, default=0)  # requests awaiting the mentor's answer
    free = serializers.SerializerMethodField()

    class Meta:
        model = SemesterMentor
        fields = [
            "id", "semester_id", "faculty", "faculty_status", "capacity", "load", "accepted", "pending", "free", "created_at",
        ]

    def get_free(self, obj) -> int:
        return max(obj.capacity - (getattr(obj, "load", 0) or 0), 0)


class SemesterMentorCreateSerializer(serializers.Serializer):
    semester_id = serializers.IntegerField(min_value=1)
    faculty_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), min_length=1, max_length=500)
    capacity = serializers.IntegerField(min_value=1, max_value=100, required=False)


class SemesterMentorUpdateSerializer(serializers.Serializer):
    capacity = serializers.IntegerField(min_value=1, max_value=100)


class AvailableMentorSerializer(serializers.Serializer):
    """What a student sees when choosing a mentor: available or full, never the counts."""

    faculty = FacultyBriefSerializer()
    specializations = serializers.SerializerMethodField()
    designation = serializers.CharField(source="faculty.designation")
    available = serializers.SerializerMethodField()

    def get_specializations(self, obj) -> list[str]:
        return [s.name for s in obj.faculty.specializations.all()]

    def get_available(self, obj) -> bool:
        return (obj.load or 0) < obj.capacity


class InviteHistorySerializer(serializers.ModelSerializer):
    """One invite of a team and how the student answered."""

    student = StudentBriefSerializer()
    invited_by = serializers.CharField(source="invited_by.name", default=None)

    class Meta:
        model = TeamInvite
        fields = ["id", "student", "status", "is_automatic", "invited_by", "created_at", "responded_at"]


class MentorHistorySerializer(serializers.ModelSerializer):
    """One mentor request/assignment and how it ended."""

    faculty = FacultyBriefSerializer()
    team = serializers.SerializerMethodField()
    by_admin = serializers.SerializerMethodField()

    class Meta:
        model = MentorAssignment
        fields = ["id", "faculty", "team", "status", "note", "is_automatic", "by_admin", "created_at", "decided_at"]

    def get_team(self, a) -> dict:
        t = a.team
        ss = t.semester_subject
        return {
            "id": t.id,
            "display_name": t.display_name,
            "subject_code": ss.subject.code,
            "semester_number": ss.semester.semester_number,
            "members": [m.student.user.name for m in t.members.all()],
        }

    def get_by_admin(self, a) -> bool:
        return a.assigned_by_id is not None


def phases_of(semester_subject_id):
    return Phase.objects.filter(semester_subject_id=semester_subject_id).order_by("order", "start_date")
