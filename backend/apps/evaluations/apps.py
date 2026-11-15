from django.apps import AppConfig


class EvaluationsConfig(AppConfig):
    name = "apps.evaluations"
    label = "evaluations"

    def ready(self):
        from . import signals  # noqa: F401
