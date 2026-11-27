import sys
from datetime import timedelta
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured
from corsheaders.defaults import default_headers as default_cors_headers

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY")
DEBUG = env.bool("DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:5173")

# The frontend normally proxies /api through its own origin (no CORS involved);
# CORS covers clients that call the backend directly.
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[FRONTEND_URL])
CORS_ALLOW_CREDENTIALS = True  # cookies (JWT + csrftoken)
CORS_ALLOW_HEADERS = (*default_cors_headers, "x-college-id")
# A frontend on another domain cannot read our cookies: it takes the CSRF token from this header
# (GET /auth/csrf/) and the download filename from Content-Disposition.
CORS_EXPOSE_HEADERS = ["X-CSRFToken", "Content-Disposition"]
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=CORS_ALLOWED_ORIGINS)

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "apps.common",
    "apps.colleges",
    "apps.accounts",
    "apps.academics",
    "apps.dashboards",
    "apps.imports",
    "apps.projects",
    "apps.teams",
    "apps.evaluations",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # before CommonMiddleware
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": ["django.template.context_processors.request"]},
    }
]

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = True
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ("email", "name")},
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "apps.common.passwords.LetterAndDigitValidator"},
]

LANGUAGE_CODE = "en-us"
# Calendar days (phase start/end dates) are judged in this zone; timestamps are stored in UTC.
TIME_ZONE = env("TIME_ZONE", default="Asia/Kolkata")
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# ---------------------------------------------------------------- DRF
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.common.authentication.CookieJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.common.permissions.IsActiveUser"],
    "DEFAULT_PAGINATION_CLASS": "apps.common.pagination.StandardPagination",
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "apps.common.filters.AliasOrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "EXCEPTION_HANDLER": "apps.common.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {
        "login": "5/min",
        "password_reset": "3/10min",
    },
    "UNAUTHENTICATED_USER": None,
}

# ---------------------------------------------------------------- JWT in cookies
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": False,
    "SIGNING_KEY": SECRET_KEY,
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "USER_AUTHENTICATION_RULE": "apps.common.authentication.user_can_authenticate",
}

AUTH_COOKIE_SECURE = env.bool("AUTH_COOKIE_SECURE", default=not DEBUG)
# "Lax" when the frontend proxies /api through its own origin (dev server, Vercel rewrite).
# "None" when the frontend calls this backend directly from another domain; needs HTTPS (Secure).
COOKIE_SAMESITE = env("COOKIE_SAMESITE", default="Lax")
if COOKIE_SAMESITE not in ("Lax", "Strict", "None"):
    raise ImproperlyConfigured("COOKIE_SAMESITE must be Lax, Strict or None")
if COOKIE_SAMESITE == "None" and not AUTH_COOKIE_SECURE:
    raise ImproperlyConfigured("COOKIE_SAMESITE=None requires AUTH_COOKIE_SECURE=True (HTTPS)")
AUTH_COOKIE_SAMESITE = COOKIE_SAMESITE
AUTH_ACCESS_COOKIE = "pms_access"
AUTH_REFRESH_COOKIE = "pms_refresh"
AUTH_REFRESH_COOKIE_PATH = "/api/v1/auth/"

CSRF_COOKIE_NAME = "csrftoken"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = COOKIE_SAMESITE
CSRF_COOKIE_SECURE = AUTH_COOKIE_SECURE
CSRF_COOKIE_AGE = 60 * 60 * 24 * 365

# ---------------------------------------------------------------- OpenAPI
SPECTACULAR_SETTINGS = {
    "TITLE": "PMS API",
    "DESCRIPTION": "Project Management System API. See docs/API.md for conventions.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
}
API_DOCS_PUBLIC = env.bool("API_DOCS_PUBLIC", default=DEBUG)

# ---------------------------------------------------------------- Email
EMAIL_BACKEND = env("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="PMS <no-reply@example.com>")
EMAIL_TIMEOUT = 20

# ---------------------------------------------------------------- PMS
SUPER_ADMIN_EMAIL = env("SUPER_ADMIN_EMAIL", default="")
SUPER_ADMIN_PASSWORD = env("SUPER_ADMIN_PASSWORD", default="")
SUPER_ADMIN_NAME = env("SUPER_ADMIN_NAME", default="Super Admin")
JOBS_SECRET = env("JOBS_SECRET", default="")
DEMO_PASSWORD = env("DEMO_PASSWORD", default="")  # manage.py seed_demo (dev only)

OTP_TTL_SECONDS = 600
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
PASSWORD_RESET_TOKEN_TTL_SECONDS = 600
EMAIL_MAX_ATTEMPTS = 5
EMAIL_BATCH_SIZE = 50
# Activation emails are sent right after the request; stop after this many seconds
# (large bulk activations) and leave the rest to the jobs endpoint.
EMAIL_SEND_TIME_BUDGET_SECONDS = env.int("EMAIL_SEND_TIME_BUDGET_SECONDS", default=20)
# Send emails on a background thread after commit (requests never wait for SMTP).
# Off under `manage.py test` so tests can assert on sent mail synchronously.
EMAIL_ASYNC = env.bool("EMAIL_ASYNC", default=sys.argv[1:2] != ["test"])

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
