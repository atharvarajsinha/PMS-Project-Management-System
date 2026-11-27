# PMS — Feature Checklist

Status as of 2026-11-14, audited against `docs/PRD.md` and `docs/roadmap.md` and the code in `backend/` and `frontend/`.
Backend test suite: **121 tests, all passing** (Postgres, `manage.py test apps --noinput`). Updated 2026-11-14 after Phase 2 (projects & teams).
Deployment (Render, Vercel, Brevo, UptimeRobot) is deferred until Phase 3 is complete.

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
- [x] Sections (name unique per semester) + class coordinator assign/remove (one per semester per faculty)
- [x] Semester-subject offerings
- [x] Section-subject mappings (incl. bulk map) + faculty assignment per section-subject
- [x] Search / filters / pagination on lists
- [x] Frontend: Faculty, Students, Semesters, Subjects, Sections, Mapping pages
- [x] Subject Mapping redesigned: one **By semester** grid (subjects × sections, faculty picked in each cell, "+ Map", map to all sections, add subject to semester) + an **All mappings** list
- [x] Bulk delete (`POST {list}/bulk-delete/`) on faculty, students, semesters, subjects, sections, offerings, mappings — blocked rows are skipped with a reason
- [x] **CSV imports** (pulled forward from Phase 3): faculty, semesters, subjects, sections & class coordinators, students, subject mappings — template download, dry-run preview, partial import of valid rows, error-rows CSV; *Import Data* page + "Import CSV" on each list page

### 6. College configuration
- [x] `GET/PATCH /settings/` — min/max team size, default mentor capacity, team formation (closing it locks all teams) (DB check constraints)
- [x] Frontend: Settings page

### 7. Audit logging
- [x] `AuditLog` model + `audit.record()` on auth, profile, colleges, college admin, people, academics, settings

### 8. Dashboards & faculty portal (pulled into Phase 1)
- [x] `GET /dashboard/` — College Admin counts + pending-setup items
- [x] `GET /my/dashboard/` — faculty dashboard
- [x] `/my/class-sections/` — class coordinator manages own section's students (no delete / no section move)
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

### ❗ What's left in Phase 1 (deployment items deferred until after Phase 3)
- [ ] **Deploy backend to Render** (service, Postgres, env vars, start command `migrate && gunicorn`)
- [ ] **Deploy frontend to Vercel** — `frontend/vercel.json` still has the `<render-service>` placeholder
- [ ] **Production email** — configure Brevo SMTP env vars on Render (code is SMTP-generic; only config needed)
- [ ] **UptimeRobot monitor** on `/api/v1/jobs/run/?token=<JOBS_SECRET>` every 5 min
- [x] **Version control** — git repository initialised
- [x] **End-to-end check against the live backend** (2026-10-23): every page for Admin, Faculty, Student and Super Admin (incl. managing a college) loads with no console/HTTP errors; profile save, import, bulk delete and mapping grid exercised. Not exercised in the browser: activation emails (real SMTP) and the password-reset flow (covered by backend tests)
- [ ] MSW mock mode has no handlers for `/imports/` and `bulk-delete` yet (those features need the real backend)
- [x] Student dashboard: subjects, teams joined, pending invites, phase deadlines (Phase 2)
- [~] Super Admin dashboard is built from the colleges list only (aggregates planned for Phase 3)
- [ ] Frontend tests (none exist; backend has 121)

---

## Phase 2 — Projects & teams (built 2026-11-14)
Apps: `projects` (phases, submissions), `teams` (mentor lists, teams, invites, mentor requests), `evaluations`
(evaluator assignments, marks). API: `docs/API.md` §24.

### Central choices
- [x] Every status/role/type list lives once in `backend/apps/common/choices.py` (models alias it, e.g. `User.Role`)
- [x] `GET /meta/choices/` + generated `frontend/src/config/choices.generated.js` (`manage.py export_choices`); a test fails if it's stale
- [x] Frontend uses `src/config/choices.js` (`labelOf`, `optionsOf`, constants); hard-coded role/status label dicts removed; `StatusBadge group=…`

### Backend
- [x] Phases: dates, max marks, order/reorder, unique name, no overlap (Postgres exclusion constraint + friendly 409), status UPCOMING/OPEN/CLOSED/LOCKED computed from dates, manual lock/unlock, auto-lock after `evaluation_end_date` (not again after a manual unlock)
- [x] Semester mentor list + per-faculty capacity (can't drop below current load; can't remove while holding teams)
- [x] Teams per semester-subject: create, invite → accept/decline, leave, remove, change lead, disband; eligibility by section mapping; one team per student per subject (DB unique); max size under row lock; min size → "incomplete"; formation on/off; global lock (students frozen, Admin can still change)
- [x] Mentor requests: FCFS within capacity under a row lock (pending + accepted hold a slot), accept/reject, cancel; Admin assign/replace/remove, optional over-capacity, multiple mentors
- [x] Evaluator auto-assignment (subject + Team Lead's section) per phase; re-syncs on lead change (before lock), new phase, section-subject faculty change (signal: API, CSV import, grid); "evaluator pending" when no faculty; Admin override per phase with cross-section rule; reset to AUTO
- [x] Submissions: one per team per phase, multiple typed links, DRAFT/SUBMITTED, any member, OPEN only (dates checked directly)
- [x] Evaluations: CLOSED and unlocked only, marks ≤ max, 0 when nothing submitted, draft/submit, Admin corrections only (Admin never evaluates first), all changes audited; students never receive marks
- [x] Team naming by any evaluator of the team (or Admin), unique per subject
- [x] Job endpoint also syncs phase statuses / auto-lock
- [x] Guards: Team Lead can't be deleted (RESTRICT + clear 409); a student in a team can't be moved to a section that doesn't take that subject
- [x] **Add-on:** class coordinator sees each student of their section × subject → team, role, mentor(s), evaluator per phase (`/my/class-sections/{id}/teams/`)
- [x] `TIME_ZONE` setting (default `Asia/Kolkata`) so "today" for phase dates is the college's day
- [x] 52 new tests (121 total)

### Frontend
- [x] Admin: Phases, Mentors, Teams (detail sheet: rename, members, lead, mentor, evaluator per phase; "students without a team" tab), Evaluations (with mark corrections)
- [x] Faculty: Mentoring (requests + mentored teams with submissions), Evaluations (phase picker, links, marks, team naming), Section → "Students' teams"
- [x] Student: My Projects (create/join/invite/leave, mentor choice, link submissions) and a real dashboard
- [x] Browser check against the live backend with `seed_demo` data (2026-11-14): admin, faculty and student flows, no server errors

### Round 2 updates (2026-11-14)
- [x] Auto-refresh every 10 s on every page (paused while the tab is hidden) + refresh button in the header
- [x] Emails sent on a background thread after commit (`EMAIL_ASYNC`); OTP too; outbox job still retries
- [x] Mentors CSV import (`semester, faculty_email, capacity`) — many semesters in one file; Import CSV on the Mentors page
- [x] New team dialog hides students already picked
- [x] Students see mentors only as Available / Full; capacity counts accepted teams; filling the last slot auto-rejects waiting requests
- [x] Mentor history for faculty (`/my/mentoring/history/`) and request history for the Team Lead (`/my/teams/{id}/mentor-requests/`)
- [x] Marks per student: "marks for everyone" + individual overrides (`student_marks` table; old team marks copied to each member by migration)
- [x] 129 backend tests passing
- [ ] Browser check of this round (demo login no longer available in the dev DB)
- [x] Team delete removes members, invites, mentor requests, submissions + links, evaluator assignments, evaluations and per-student marks (database cascade; covered by a test)
- [x] Marks inputs masked like passwords (frontend only, show/hide eye, digits only, ignored by password managers)
- [x] Invite history for the Team Lead (accepted / declined / cancelled, incl. "joined another team")
- [x] Class coordinator: "Details & marks" modal per student — evaluator and that student's marks for every phase, totals per subject
- [x] Student project card: "Submission: start–end · Pending/Submitted" and "Evaluation: end+1 – evaluation end · Pending/Completed" (new central choices `SubmissionProgress`, `EvaluationProgress`)
- [x] 133 backend tests passing

### Left / not done
- [ ] MSW mock handlers for Phase 2 endpoints (mock mode doesn't cover these screens)
- [ ] Notifications for invites, mentor decisions and deadlines (Phase 3 notifications)
- [ ] Faculty dashboard tiles for mentoring/evaluation counts (Phase 3 dashboards)

## Phase 3 — Remaining features (not started)
- [ ] Notifications: in-app, email, push + push subscriptions
- [x] Bulk CSV imports: template → validate → preview → partial import → error CSV (done early, see Phase 1)
- [ ] Reports & data downloads
- [ ] Student promotion (Admin only) + semester-end reset (wipe teams/assignments/submissions/marks, keep structure + phases)
- [ ] Dashboards: Super Admin aggregates, Student, extended Admin/Faculty (teams, phases, evaluations)
- [ ] Audit log viewer APIs + UI (platform-wide for Super Admin, per college for Admin)
