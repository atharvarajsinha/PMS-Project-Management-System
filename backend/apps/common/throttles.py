from rest_framework.throttling import SimpleRateThrottle


def _email_from(request):
    email = request.data.get("email") if hasattr(request, "data") else None
    return (email or "").strip().lower() if isinstance(email, str) else ""


class LoginThrottle(SimpleRateThrottle):
    """5/min per IP + email."""

    scope = "login"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": f"{self.get_ident(request)}:{_email_from(request)}"}


class PasswordResetThrottle(SimpleRateThrottle):
    """3 per 10 minutes per email."""

    scope = "password_reset"

    def get_cache_key(self, request, view):
        email = _email_from(request)
        if not email:
            return None
        return self.cache_format % {"scope": self.scope, "ident": email}

    def parse_rate(self, rate):
        # supports "3/10min"
        num, period = rate.split("/")
        multiplier = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        digits = "".join(c for c in period if c.isdigit()) or "1"
        unit = period[len(digits):][0] if period[0].isdigit() else period[0]
        return int(num), int(digits) * multiplier[unit]
