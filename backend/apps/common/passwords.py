import hashlib
import hmac
import secrets
import string

from django.conf import settings
from django.core.exceptions import ValidationError


class LetterAndDigitValidator:
    """Password must contain at least one letter and one digit."""

    def validate(self, password, user=None):
        if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
            raise ValidationError(
                "Password must contain at least one letter and one number.",
                code="password_no_letter_or_digit",
            )

    def get_help_text(self):
        return "Your password must contain at least one letter and one number."


def generate_temp_password(length=12):
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isalpha() for c in password) and any(c.isdigit() for c in password):
            return password


def generate_otp():
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_otp(otp):
    return hmac.new(settings.SECRET_KEY.encode(), otp.encode(), hashlib.sha256).hexdigest()


def otp_matches(otp, otp_hash):
    return hmac.compare_digest(hash_otp(otp), otp_hash)
