from rest_framework.routers import SimpleRouter

from .views import EvaluationAdminViewSet, MyEvaluationViewSet

router = SimpleRouter()
router.register("evaluations", EvaluationAdminViewSet, basename="evaluations")
router.register("my/evaluations", MyEvaluationViewSet, basename="my-evaluations")

urlpatterns = router.urls
