from django.db import transaction
from django.urls import path

from .views import ChoicesView, HealthView, JobsRunView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("meta/choices/", ChoicesView.as_view(), name="choices"),
    # each email gets its own transaction; never wrap the whole run in one
    path("jobs/run/", transaction.non_atomic_requests(JobsRunView.as_view()), name="jobs-run"),
]
