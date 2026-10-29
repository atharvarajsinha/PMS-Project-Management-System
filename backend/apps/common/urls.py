from django.db import transaction
from django.urls import path

from .views import HealthView, JobsRunView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    # each email gets its own transaction; never wrap the whole run in one
    path("jobs/run/", transaction.non_atomic_requests(JobsRunView.as_view()), name="jobs-run"),
]
