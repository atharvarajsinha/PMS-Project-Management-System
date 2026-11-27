from django.urls import path

from .views import ImportKindsView, ImportRunView, ImportTemplateView, ReportDownloadView, ReportKindsView

urlpatterns = [
    path("imports/", ImportKindsView.as_view(), name="imports"),
    path("imports/<slug:kind>/", ImportRunView.as_view(), name="import-run"),
    path("imports/<slug:kind>/template/", ImportTemplateView.as_view(), name="import-template"),
    path("reports/", ReportKindsView.as_view(), name="reports"),
    path("reports/<slug:kind>/", ReportDownloadView.as_view(), name="report-download"),
]
