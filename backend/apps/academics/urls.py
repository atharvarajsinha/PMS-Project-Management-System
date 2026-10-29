from rest_framework.routers import SimpleRouter

from .views import SectionSubjectViewSet, SectionViewSet, SemesterSubjectViewSet, SemesterViewSet, SubjectViewSet
from .views_faculty import MyClassSectionViewSet, MyClassStudentViewSet, MyTeachingViewSet

router = SimpleRouter()
router.register("semesters", SemesterViewSet, basename="semesters")
router.register("subjects", SubjectViewSet, basename="subjects")
router.register("sections", SectionViewSet, basename="sections")
router.register("semester-subjects", SemesterSubjectViewSet, basename="semester-subjects")
router.register("section-subjects", SectionSubjectViewSet, basename="section-subjects")

# faculty portal
router.register("my/class-sections", MyClassSectionViewSet, basename="my-class-sections")
router.register(r"my/class-sections/(?P<section_pk>\d+)/students", MyClassStudentViewSet, basename="my-class-students")
router.register("my/teaching", MyTeachingViewSet, basename="my-teaching")

urlpatterns = router.urls
