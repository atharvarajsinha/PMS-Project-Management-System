# PMS Backend Roadmap

Django 5.2 LTS · DRF · simplejwt (httpOnly cookies) · PostgreSQL 18 · Python 3.11
Deploy: backend on Render, frontend on Vercel. All APIs under `/api/v1/`, Swagger at `/api/docs/`.

## App layout

```
backend/
├── config/            settings (base / dev / prod), urls, wsgi
├── apps/
│   ├── common/        shared services used by every app (see below)
│   ├── colleges/      colleges, college settings, College Admin creation (Super Admin)
│   ├── accounts/      users, auth, profile, faculty & student management
│   └── academics/     semesters, subjects, sections, class coordinators, subject mappings, faculty assignment
│   # Phase 2: teams/, projects/ (phases, submissions), evaluations/
│   # Phase 3: notifications/, imports/, reports/, promotions/, dashboards/
├── requirements.txt
└── .env.example
```

### `common` app — shared services
- Base models (auto-increment bigint pk, `created_at` / `updated_at`)
- College scoping: resolves the current college from the user (Super Admin: `X-College-Id` header) and filters querysets
- RBAC permission classes (`IsSuperAdmin`, `IsCollegeAdmin`, `IsFaculty`, `IsStudent`, combinations)
- Audit service + `AuditLog` model (`audit.log(actor, action, entity, old, new, request)`)
- Email service + `EmailOutbox` model (Gmail SMTP in dev, Brevo in prod)
- Password/OTP utilities (temp password generation, OTP hashing)
- Job endpoints for UptimeRobot (secret token in URL): retry unsent outbox emails (activation emails are sent immediately)
- Standard error response format, pagination, health check

## Phase 1 — Platform foundation
1. **RBAC + authentication**
   - Roles: SUPER_ADMIN, ADMIN, FACULTY, STUDENT
   - Login / logout / token refresh (JWT in httpOnly cookies, CSRF protected)
   - Forced password change on first login
   - Forgot password via email OTP → reset
   - Inactive users and users of inactive colleges cannot log in
2. **Super Admin bootstrap** — created/ensured from env vars (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`) every time the server starts (idempotent; runs in the Render start command after `migrate`)
3. **Super Admin APIs** — CRUD colleges (creates default `college_settings`), create/update/activate/deactivate/delete the College Admin, view & manage any college's data
4. **Common profile service** — `GET/PATCH /api/v1/me/` for every role (name, phone; email is read-only), change password
5. **College Admin academic CRUD**
   - Faculty: create, update, activate (emails credentials), deactivate, hard delete
   - Students: create, update, activate, deactivate, hard delete (section within semester)
   - Semesters, subjects, sections, class coordinator assignment
   - Semester-subject offerings, section-subject mappings, faculty assignment per section-subject
6. **College configuration** — `GET/PATCH` college settings: min/max team size, default mentor capacity, team formation on/off, global team lock, cross-section evaluation
7. **Audit logging** on all of the above
8. **Dashboards & faculty portal (pulled forward)** — `GET /dashboard/` (College Admin counts + pending setup), search on subject mappings, `/my/...` faculty portal: own dashboard, class-teacher student management (no delete/move), read-only teaching assignments with their students

## Phase 2 — Projects & teams
- Phases (dates, max marks, order, no overlap, status UPCOMING/OPEN/CLOSED/LOCKED, evaluation lock)
- Semester mentor list + per-faculty capacity
- Teams per semester-subject (create, invite/join, Team Lead, size rules, global lock)
- Mentor requests (FCFS, concurrency-safe accept/reject, admin reassign)
- Evaluator auto-assignment (subject + Team Lead's section) and admin override
- Phase submissions + links
- Evaluations and marks (0 for missing submission, lock/unlock, audit)
- Team naming by evaluator
- Job endpoint: phase status/auto-lock

## Phase 3 — Remaining features
- Notifications (in-app, email, push) + push subscriptions
- Bulk CSV imports (template → validate → preview → partial import → error CSV)
- Reports & data downloads
- Student promotion + semester-end reset
- Remaining dashboards (Super Admin aggregates, Student; Admin/Faculty extended with teams, phases, evaluations)
- Audit log viewer APIs
