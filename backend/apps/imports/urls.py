from django.urls import path

from .views import ImportKindsView, ImportRunView, ImportTemplateView

urlpatterns = [
    path("imports/", ImportKindsView.as_view(), name="imports"),
    path("imports/<slug:kind>/", ImportRunView.as_view(), name="import-run"),
    path("imports/<slug:kind>/template/", ImportTemplateView.as_view(), name="import-template"),
]
