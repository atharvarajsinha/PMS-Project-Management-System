# PMS Backend

Django 5.2 · DRF · simplejwt (httpOnly cookies) · PostgreSQL · Python 3.11.
API contract: [`../docs/API.md`](../docs/API.md). Swagger UI at `/api/docs/` when `DEBUG=True` (or `API_DOCS_PUBLIC=True`).

## Local setup (Windows / PowerShell)

```powershell
cd D:\PMS\backend
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env      # then edit .env (see below)
```

Create the database once (PostgreSQL 18 service must be running):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE pms;"
```

In `.env` set at least `DATABASE_URL`, `SECRET_KEY`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `JOBS_SECRET`.
Use `EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend` to print emails, or fill the Gmail SMTP values (App Password) to send them.

```powershell
.venv\Scripts\python manage.py migrate      # also creates the Super Admin from .env
.venv\Scripts\python manage.py runserver
```

- API: http://localhost:8000/api/v1/ · Swagger: http://localhost:8000/api/docs/
- Activation emails are queued. Send them with `python manage.py process_outbox`
  or `GET /api/v1/jobs/run/?token=<JOBS_SECRET>`.

## Tests

```powershell
.venv\Scripts\python manage.py test apps
```

## Layout

```
config/            settings (base/dev/prod), urls, wsgi
apps/common/       base model, cookie-JWT auth, CSRF, errors, permissions, tenancy (college context),
                   pagination/filters, audit log, email outbox, password/OTP utils, health + jobs endpoints
apps/colleges/     College, CollegeSettings, Super Admin platform APIs, /college/, /settings/
apps/accounts/     User (custom), Faculty, Student, OTPs, auth + /me, faculty & student management
apps/academics/    Semester, Subject, Section (+ class coordinator), SemesterSubject, SectionSubject
```

## Deploying to Render

- Build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
- Start command: `python manage.py migrate && gunicorn config.wsgi --bind 0.0.0.0:$PORT`
  (`migrate` ensures the Super Admin on every start)
- Env: `DJANGO_SETTINGS_MODULE=config.settings.prod`, `DEBUG=False`, `ALLOWED_HOSTS=<service>.onrender.com`,
  `FRONTEND_URL=https://<app>.vercel.app`, `CORS_ALLOWED_ORIGINS=https://<app>.vercel.app`, `DATABASE_URL`, `SECRET_KEY`, `SUPER_ADMIN_*`, `JOBS_SECRET`, Brevo SMTP `EMAIL_*`.
- UptimeRobot: HTTP monitor on `https://<service>.onrender.com/api/v1/jobs/run/?token=<JOBS_SECRET>` every 5 minutes.
- Health check path: `/api/v1/health/`.
