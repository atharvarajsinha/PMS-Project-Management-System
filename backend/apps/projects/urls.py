from rest_framework.routers import SimpleRouter

from .views import PhaseViewSet

router = SimpleRouter()
router.register("phases", PhaseViewSet, basename="phases")

urlpatterns = router.urls
