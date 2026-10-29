from rest_framework.filters import OrderingFilter


class AliasOrderingFilter(OrderingFilter):
    """`?ordering=name` → `user__name` via `view.ordering_aliases = {"name": "user__name"}`.

    Views without `ordering_aliases` behave like DRF's OrderingFilter.
    Unknown fields are ignored (default ordering applies).
    """

    def get_ordering(self, request, queryset, view):
        aliases = getattr(view, "ordering_aliases", None)
        if aliases is None:
            return super().get_ordering(request, queryset, view)

        params = request.query_params.get(self.ordering_param)
        if not params:
            return self.get_default_ordering(view)

        ordering = []
        for term in (p.strip() for p in params.split(",")):
            desc = term.startswith("-")
            field = aliases.get(term.lstrip("-"))
            if field:
                ordering.append(f"-{field}" if desc else field)
        return ordering or self.get_default_ordering(view)

    def get_schema_operation_parameters(self, view):
        params = super().get_schema_operation_parameters(view)
        aliases = getattr(view, "ordering_aliases", None)
        if aliases and params:
            params[0]["description"] = "Order by: " + ", ".join(aliases) + " (prefix - for descending)."
        return params
