from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import SemesterMentorViewSet, TeamViewSet
from .views_faculty import ClassSectionTeamsView, ClassStudentProjectView, MyMentoringViewSet
from .views_student import MyInviteViewSet, MyProjectsView, MyTeamViewSet

router = SimpleRouter()
# admin
router.register("semester-mentors", SemesterMentorViewSet, basename="semester-mentors")
router.register("teams", TeamViewSet, basename="teams")
# student portal
router.register("my/teams", MyTeamViewSet, basename="my-teams")
router.register("my/invites", MyInviteViewSet, basename="my-invites")
# faculty portal
router.register("my/mentoring", MyMentoringViewSet, basename="my-mentoring")

urlpatterns = [
    path("my/projects/", MyProjectsView.as_view(), name="my-projects"),
    path("my/class-sections/<int:section_pk>/teams/", ClassSectionTeamsView.as_view(), name="my-class-section-teams"),
    path(
        "my/class-sections/<int:section_pk>/teams/<int:student_pk>/",
        ClassStudentProjectView.as_view(),
        name="my-class-student-project",
    ),
    *router.urls,
]
