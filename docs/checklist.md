# PMS — Feature Checklist

Status as of 2026-10-23, audited against `docs/PRD.md` and `docs/roadmap.md` and the code in `backend/` and `frontend/`.
Backend test suite: **69 tests, all passing** (Postgres, `manage.py test apps --noinput`). Updated 2026-10-23 after the email templates / CSV import / bulk delete / mapping work.

Legend: `[x]` done · `[~]` partial / not verified · `[ ]` not started

---

## Phase 1 — Platform foundation

### 1. RBAC + authentication
- [x] Roles SUPER_ADMIN / ADMIN / FACULTY / STUDENT + permission classes (`common/permissions.py`)
- [x] Login / logout / refresh, JWT in httpOnly cookies, CSRF endpoint (`auth/csrf|login|refresh|logout`)
- [x] Logout blacklists refresh token
- [x] Forced password change on first login (`must_change_password`, `/change-password` page)
- [x] Forgot password via email OTP: request → verify → confirm (hashed, expiring, attempt-limited)
- [x] Inactive users and users of inactive colleges blocked from login
- [x] Login/OTP throttling (`common/throttles.py`)
- [x] Frontend: Login, Forgot password, Reset password, Change password pages + route guards

### 2. Super Admin bootstrap
- [x] Ensured from `SUPER_ADMIN_*` env vars after every `migrate` (post_migrate signal) + `ensure_superadmin` command

### 3. Super Admin APIs
- [x] Colleges CRUD + activate/deactivate (`platform/colleges/`), default `college_settings` auto-created
- [x] College Admin create / update / delete / activate / deactivate / resend credentials
- [x] View & manage any college via `X-College-Id` header (college scoping in `common/tenancy.py`)
- [x] Frontend: SA dashboard, Colleges page, College Admins page, College switcher

### 4. Common profile service
- [x] `GET/PATCH /me/` (name, phone; email read-only), change password
- [x] Frontend: Profile page (fixed 2026-10-23: it crashed on load — email field used form-field components outside a form field)

### 5. College Admin academic CRUD
- [x] Faculty: create, update, activate (emails credentials), deactivate, resend credentials, hard delete, bulk activate/deactivate
- [x] Students: same as faculty, section-within-semester validation, roll number unique per college
- [x] Semesters (1–12, unique per college)
- [x] Subjects (code unique per college)
- [x] Sections (name unique per semester) + class teacher assign/remove (one per semester per faculty)
- [x] Semester-subject offerings
- [x] Section-subject mappings (incl. bulk map) + faculty assignment per section-subject
- [x] Search / filters / pagination on lists
- [x] Frontend: Faculty, Students, Semesters, Subjects, Sections, Mapping pages
- [x] Subject Mapping redesigned: one **By semester** grid (subjects × sections, faculty picked in each cell, "+ Map", map to all sections, add subject to semester) + an **All mappings** list
- [x] Bulk delete (`POST {list}/bulk-delete/`) on faculty, students, semesters, subjects, sections, offerings, mappings — blocked rows are skipped with a reason
- [x] **CSV imports** (pulled forward from Phase 3): faculty, semesters, subjects, sections & class teachers, students, subject mappings — template download, dry-run preview, partial import of valid rows, error-rows CSV; *Import Data* page + "Import CSV" on each list page

### 6. College configuration
- [x] `GET/PATCH /settings/` — min/max team size, default mentor capacity, team formation, global team lock, cross-section evaluation (DB check constraints)
- [x] Frontend: Settings page

### 7. Audit logging
- [x] `AuditLog` model + `audit.record()` on auth, profile, colleges, college admin, people, academics, settings

### 8. Dashboards & faculty portal (pulled into Phase 1)
- [x] `GET /dashboard/` — College Admin counts + pending-setup items
- [x] `GET /my/dashboard/` — faculty dashboard
- [x] `/my/class-sections/` — class teacher manages own section's students (no delete / no section move)
- [x] `/my/teaching/` — read-only teaching assignments with students
- [x] Frontend: Admin dashboard, Faculty dashboard, My Classes, Class Section, Teaching, Teaching detail

### Common services / infrastructure
- [x] Base model (bigint PK, timestamps), standard error format, pagination, health check
- [x] Email service + `EmailOutbox`; activation emails sent immediately after commit (20 s budget)
- [x] Email templates (HTML + plain text) for account activation and password-reset OTP (`apps/common/templates/emails/`)
- [x] Job endpoint `jobs/run/?token=…` for UptimeRobot (retries failed outbox emails)
- [x] Swagger at `/api/docs/` (drf-spectacular), `docs/API.md`, `docs/openapi.yml`
- [x] PWA shell (manifest, service worker, update prompt, offline banner), light/dark theme
- [x] MSW mock mode for frontend (`npm run dev:mock`)

### ❗ What's left in Phase 1
- [ ] **Deploy backend to Render** (service, Postgres, env vars, start command `migrate && gunicorn`)
- [ ] **Deploy frontend to Vercel** — `frontend/vercel.json` still has the `<render-service>` placeholder
- [ ] **Production email** — configure Brevo SMTP env vars on Render (code is SMTP-generic; only config needed)
- [ ] **UptimeRobot monitor** on `/api/v1/jobs/run/?token=<JOBS_SECRET>` every 5 min
- [ ] **Version control** — project is not a git repository yet
- [x] **End-to-end check against the live backend** (2026-10-23): every page for Admin, Faculty, Student and Super Admin (incl. managing a college) loads with no console/HTTP errors; profile save, import, bulk delete and mapping grid exercised. Not exercised in the browser: activation emails (real SMTP) and the password-reset flow (covered by backend tests)
- [ ] MSW mock mode has no handlers for `/imports/` and `bulk-delete` yet (those features need the real backend)
- [~] Student dashboard is a placeholder (real content depends on Phase 2 teams/phases)
- [~] Super Admin dashboard is built from the colleges list only (aggregates planned for Phase 3)
- [ ] Frontend tests (none exist; backend has 58)

---

## Phase 2 — Projects & teams (not started)
- [ ] Phases: dates, max marks, order, no overlap (exclusion constraint), status UPCOMING/OPEN/CLOSED/LOCKED, evaluation lock
- [ ] Semester mentor list + per-faculty capacity
- [ ] Teams per semester-subject: create, invite/join, Team Lead, size rules, formation on/off, global lock
- [ ] Mentor requests: FCFS, concurrency-safe accept/reject, admin reassign
- [ ] Evaluator auto-assignment (subject + Team Lead's section) + admin override, cross-section setting
- [ ] Phase submissions + links (DRAFT/SUBMITTED, closes at phase end date)
- [ ] Evaluations & marks: 0 for missing submission, lock/unlock, audit; Admin cannot evaluate
- [ ] Team naming by evaluator
- [ ] Job endpoint: phase status updates / auto-lock
- [ ] Frontend screens for all of the above (admin, faculty-as-mentor/evaluator, student)

## Phase 3 — Remaining features (not started)
- [ ] Notifications: in-app, email, push + push subscriptions
- [x] Bulk CSV imports: template → validate → preview → partial import → error CSV (done early, see Phase 1)
- [ ] Reports & data downloads
- [ ] Student promotion (Admin only) + semester-end reset (wipe teams/assignments/submissions/marks, keep structure + phases)
- [ ] Dashboards: Super Admin aggregates, Student, extended Admin/Faculty (teams, phases, evaluations)
- [ ] Audit log viewer APIs + UI (platform-wide for Super Admin, per college for Admin)
