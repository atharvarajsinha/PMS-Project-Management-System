"""Audit trail service. Call `audit.record(...)` after every state-changing action."""

import json

from django.core.exceptions import FieldDoesNotExist
from django.core.serializers.json import DjangoJSONEncoder

from .models import AuditLog


def snapshot(instance, fields):
    """Plain dict of `fields` from a model instance (FKs as their id)."""
    if instance is None:
        return None
    data = {}
    for name in fields:
        try:
            attr = instance._meta.get_field(name).attname
        except FieldDoesNotExist:
            attr = name
        data[name] = getattr(instance, attr)
    return data


def _json_safe(values):
    if values is None:
        return None
    return json.loads(json.dumps(values, cls=DjangoJSONEncoder))


def _client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.META.get("REMOTE_ADDR") or None


def record(request, action, entity=None, *, old=None, new=None, college=None, entity_type=None, actor=None):
    """
    action:  dotted verb, e.g. "faculty.create", "college.deactivate"
    entity:  the model instance acted on (sets entity_type / entity_id)
    college: defaults to the request's college context, else the actor's college
    actor:   defaults to request.user (pass explicitly for login / password reset)
    """
    actor = actor if actor is not None else getattr(request, "user", None)
    if college is None:
        college = getattr(request, "_pms_college", None) or getattr(actor, "college", None)

    return AuditLog.objects.create(
        college=college,
        actor=actor,
        actor_role=getattr(actor, "role", "") or "",
        action=action,
        entity_type=entity_type or (entity._meta.label if entity is not None else ""),
        entity_id=getattr(entity, "pk", None),
        old_values=_json_safe(old),
        new_values=_json_safe(new),
        ip_address=_client_ip(request) if request is not None else None,
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:1000] if request is not None else ""),
    )
