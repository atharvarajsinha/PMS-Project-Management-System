import sys

from .base import *  # noqa: F401,F403

if "test" in sys.argv:
    # fast hashing keeps the test suite quick
    PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
    EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
