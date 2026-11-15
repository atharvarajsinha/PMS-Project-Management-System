# PMS API Reference — Phase 1

Contract between the Django backend and the React frontend so both can be built in parallel.
Once the backend exists, the live, generated version is at `/api/docs/` (Swagger) and `/api/schema/` (OpenAPI). If the two ever disagree, raise it — don't silently code around it.

**Status:** v1 · Phase 1 (Platform foundation) — implemented in `backend/`. A generated OpenAPI file is checked in at [`docs/openapi.yml`](openapi.yml) (regenerate with `python manage.py spectacular --file ../docs/openapi.yml`); it can drive mock servers or client generation.

## Contents
1. [Conventions](#1-conventions)
2. [Authentication & cookies](#2-authentication--cookies)
3. [Errors](#3-errors)
4. [Enums](#4-enums)
5. [Shared objects](#5-shared-objects)
6. [Permissions matrix](#6-permissions-matrix)
7. [Auth endpoints](#7-auth-endpoints)
8. [Profile (`/me`)](#8-profile-me)
9. [Super Admin — colleges & college admins](#9-super-admin--colleges--college-admins)
10. [College & settings](#10-college--settings)
11. [Faculty](#11-faculty)
12. [Students](#12-students)
13. [Semesters](#13-semesters)
14. [Subjects](#14-subjects)
15. [Sections & class teachers](#15-sections--class-teachers)
16. [Semester subjects (offerings)](#16-semester-subjects-offerings)
17. [Section subjects & faculty assignment](#17-section-subjects--faculty-assignment)
18. [Dashboards](#18-dashboards)
19. [Faculty portal (`/my/...`)](#19-faculty-portal-my)
20. [System endpoints](#20-system-endpoints)
21. [Frontend integration checklist](#21-frontend-integration-checklist)
22. [Bulk delete](#22-bulk-delete)
23. [CSV imports](#23-csv-imports)
24. [Phase 2 — phases, mentors, teams, submissions, evaluations](#24-phase-2--phases-mentors-teams-submissions-evaluations)

---

## 1. Conventions

| Item | Rule |
|---|---|
| Base path | `/api/v1` (all paths below are relative to it) |
| Format | JSON, `Content-Type: application/json`; field names `snake_case` |
| IDs | Positive integers (auto-increment). Never assume they are sequential or guessable-safe; access is always checked server-side. |
| Timestamps | ISO 8601 UTC, e.g. `2026-10-22T09:30:00Z`. Frontend converts to local time. |
| Trailing slash | Required: `/faculty/`, not `/faculty` |
| Create | `201 Created` + created object |
| Update | `PATCH` (partial) → `200 OK` + full updated object |
| Delete | `204 No Content`. **All deletes are hard deletes.** |
| Actions | `POST /resource/{id}/<action>/` (e.g. `/activate/`) |
| Email | Always lower-cased and trimmed by the server; globally unique; never editable after creation |

### Pagination
All list endpoints are paginated.

`GET /faculty/?page=2&page_size=20`

```json
{
  "count": 57,
  "page": 2,
  "page_size": 20,
  "total_pages": 3,
  "results": [ ... ]
}
```
- `page_size` default **20**, max **200** (use `200` for dropdowns).
- `search=` — free-text search (fields listed per endpoint).
- `ordering=` — field name, prefix `-` for descending (e.g. `ordering=-created_at`).

### College context
Every endpoint from section 10 onward works **inside one college**.
- **College Admin / Faculty / Student:** the college is taken from the logged-in user. Nothing to send.
- **Super Admin:** must send header `X-College-Id: <college id>` to view or manage a college's data. Missing → `400 COLLEGE_CONTEXT_REQUIRED`.

---

## 2. Authentication & cookies

JWT tokens live in **httpOnly cookies** — the frontend never reads or stores tokens.

| Cookie | HttpOnly | Lifetime | Path | Purpose |
|---|---|---|---|---|
| `pms_access` | yes | 15 min | `/` | Access token, sent automatically |
| `pms_refresh` | yes | 7 days | `/api/v1/auth/` | Refresh token (rotated on every refresh) |
| `csrftoken` | **no** | 1 year | `/` | CSRF token the frontend copies into a header |

All cookies: `Secure` in production, `SameSite=Lax`.

### Same-origin requirement (important)
Frontend (Vercel) and backend (Render) are different domains, and browsers increasingly block third-party cookies. So the frontend **proxies `/api` through its own origin**, making the cookies first-party:

- **Production — `vercel.json`:**
  ```json
  { "rewrites": [
      { "source": "/api/:path*", "destination": "https://<render-service>.onrender.com/api/:path*" },
      { "source": "/(.*)", "destination": "/index.html" }
  ] }
  ```
- **Development — `vite.config.js`:**
  ```js
  server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } }
  ```
- The frontend always calls relative URLs: `axios.create({ baseURL: '/api/v1', withCredentials: true })`.

### CSRF
- Call `GET /auth/csrf/` once on app start; it sets the `csrftoken` cookie.
- Every `POST / PATCH / PUT / DELETE` must send header `X-CSRFToken: <value of csrftoken cookie>`.
- Missing/invalid → `403 CSRF_FAILED`.

### Session flow
```
App start  → GET /auth/csrf/ → GET /me/
               200 → logged in (check must_change_password)
               401 → show login
Any call   → 401 TOKEN_EXPIRED → POST /auth/refresh/ → retry original call once
                                   refresh fails → go to login
```
Queue concurrent requests while one refresh is in flight (only one refresh call at a time).

### Forced password change
While `must_change_password` is `true`, every endpoint except `GET /me/`, `POST /auth/change-password/`, `POST /auth/logout/`, `POST /auth/refresh/` returns `403 PASSWORD_CHANGE_REQUIRED`. Frontend should route straight to the change-password screen.

### Password policy
Minimum 8 characters, at least one letter and one number, not too similar to name/email, not a common password. Violations come back as `VALIDATION_ERROR` on `new_password`.

---

## 3. Errors

Every non-2xx response has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": {
      "email": ["A user with this email already exists."],
      "phone": ["Enter a valid phone number."]
    }
  }
}
```
- `details` is present only for field errors. Non-field errors appear under `details.non_field_errors`.
- Show `message` in a toast; map `details` onto form fields.

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 400 | `COLLEGE_CONTEXT_REQUIRED` | Super Admin called a college endpoint without `X-College-Id` |
| 401 | `NOT_AUTHENTICATED` | No/invalid access cookie |
| 401 | `TOKEN_EXPIRED` | Access token expired → refresh |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password |
| 401 | `REFRESH_INVALID` | Refresh token missing/expired/revoked → login |
| 403 | `PERMISSION_DENIED` | Role not allowed |
| 403 | `ACCOUNT_INACTIVE` | User is inactive |
| 403 | `COLLEGE_INACTIVE` | User's college is inactive |
| 403 | `PASSWORD_CHANGE_REQUIRED` | Must change temporary password first |
| 403 | `CSRF_FAILED` | Missing/invalid CSRF header |
| 404 | `NOT_FOUND` | Doesn't exist **or** belongs to another college |
| 409 | `CONFLICT` | Uniqueness / business-rule conflict (see endpoint) |
| 409 | `HAS_DEPENDENTS` | Delete blocked (e.g. section still has students) |
| 429 | `RATE_LIMITED` | Too many attempts; `Retry-After` header in seconds |
| 500 | `SERVER_ERROR` | Unexpected |

---

## 4. Enums

**Single source:** every enum (value + UI label) is defined once in `backend/apps/common/choices.py`.
`GET /meta/choices/` returns them all as `{Group: [{value, label}]}`, and the frontend reads the generated copy
`frontend/src/config/choices.generated.js` through `src/config/choices.js` (`labelOf`, `optionsOf`, constants).
After changing `choices.py`, run `python manage.py export_choices` (a test fails if the copy is stale); changing a
*value* also needs `makemigrations`.

| Group | Values |
|---|---|
| `Role` | `SUPER_ADMIN`, `ADMIN`, `FACULTY`, `STUDENT` |
| `AccountStatus` | `ACTIVE`, `INACTIVE` |
| `CollegeStatus` | `ACTIVE`, `INACTIVE` |
| `PhaseStatus` | `UPCOMING`, `OPEN`, `CLOSED`, `LOCKED` |
| `SubmissionStatus` | `DRAFT`, `SUBMITTED` |
| `LinkType` | `REPOSITORY`, `DOCUMENTATION`, `DEMO`, `PRESENTATION`, `GOOGLE_DRIVE`, `GOOGLE_FORM`, `VIDEO`, `OTHER` |
| `TeamRole` | `LEAD`, `MEMBER` (derived: the member who is `team.lead`) |
| `InviteStatus` | `PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED` |
| `MentorStatus` | `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `REMOVED` |
| `EvaluatorSource` | `AUTO`, `ADMIN_OVERRIDE` |
| `EvaluationStatus` | `PENDING`, `SUBMITTED` |

---

## 5. Shared objects

### `UserSummary`
```json
{ "id": 1, "name": "Faculty X", "email": "x@college.edu" }
```

### `Me`
```json
{
  "id": 1,
  "email": "student@college.edu",
  "name": "Riya Sharma",
  "phone": "+919876543210",
  "role": "STUDENT",
  "status": "ACTIVE",
  "must_change_password": false,
  "last_login_at": "2026-10-22T09:30:00Z",
  "college": { "id": 1, "name": "Sitare University", "code": "SITARE" },
  "faculty": null,
  "student": {
    "id": 1,
    "roll_number": "CSE22001",
    "semester": { "id": 1, "semester_number": 7 },
    "section": { "id": 1, "name": "A" }
  }
}
```
- `college` is `null` for Super Admin.
- `faculty` is `{ "id": 1 }` for faculty, else `null`. `student` is filled only for students.

### `College`
```json
{
  "id": 1,
  "name": "Sitare University",
  "code": "SITARE",
  "status": "ACTIVE",
  "contact_email": "office@sitare.edu",
  "contact_phone": "+91...",
  "address": "…",
  "admin": { "id": 1, "name": "…", "email": "…", "status": "ACTIVE" },
  "stats": { "faculty": 40, "students": 900, "semesters": 8 },
  "created_at": "…",
  "updated_at": "…"
}
```
`admin` is `null` if no College Admin exists yet. `stats` only on Super Admin endpoints.

### `CollegeAdmin`
```json
{
  "id": 1, "name": "…", "email": "…", "phone": "…",
  "status": "INACTIVE", "must_change_password": true,
  "activated_at": null, "last_login_at": null,
  "created_at": "…", "updated_at": "…"
}
```

### `CollegeSettings`
```json
{
  "min_team_size": 2,
  "max_team_size": 4,
  "default_mentor_capacity": 5,
  "team_formation_enabled": false,
  "teams_locked": false,
  "teams_locked_at": null,
  "allow_cross_section_evaluation": false,
  "updated_by": { "id": 1, "name": "…", "email": "…" },
  "updated_at": "…"
}
```

### `Faculty`
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Faculty X",
  "email": "x@college.edu",
  "phone": "+91…",
  "status": "ACTIVE",
  "must_change_password": false,
  "activated_at": "…",
  "last_login_at": "…",
  "class_teacher_of": [
    { "section_id": 1, "section_name": "A", "semester_id": 1, "semester_number": 7 }
  ],
  "teaching_count": 3,
  "created_at": "…",
  "updated_at": "…"
}
```
Detail (`GET /faculty/{id}/`) adds:
```json
"teaching": [
  { "section_subject_id": 1, "semester_number": 7, "section_name": "A",
    "subject_code": "DAA", "subject_name": "Design & Analysis of Algorithms" }
]
```

### `Student`
```json
{
  "id": 1,
  "user_id": 1,
  "name": "Riya Sharma",
  "email": "riya@college.edu",
  "phone": "+91…",
  "roll_number": "CSE22001",
  "status": "INACTIVE",
  "must_change_password": true,
  "activated_at": null,
  "last_login_at": null,
  "semester": { "id": 1, "semester_number": 7 },
  "section": { "id": 1, "name": "A" },
  "created_at": "…",
  "updated_at": "…"
}
```

### `Semester`
```json
{
  "id": 1,
  "semester_number": 7,
  "sections_count": 6,
  "subjects_count": 3,
  "students_count": 360,
  "created_at": "…",
  "updated_at": "…"
}
```

### `Subject`
```json
{ "id": 1, "code": "DAA", "name": "Design & Analysis of Algorithms",
  "offered_in": [7, 5], "created_at": "…", "updated_at": "…" }
```
`offered_in` = semester numbers where this subject is offered.

### `Section`
```json
{
  "id": 1,
  "name": "A",
  "semester": { "id": 1, "semester_number": 7 },
  "class_teacher": { "id": 1, "name": "Faculty X", "email": "x@college.edu" },
  "students_count": 60,
  "subjects": [
    { "section_subject_id": 1, "subject_code": "DAA", "subject_name": "…",
      "faculty": { "id": 1, "name": "Faculty X", "email": "…" } }
  ],
  "created_at": "…",
  "updated_at": "…"
}
```
`class_teacher` and `subjects[].faculty` may be `null`.

### `SemesterSubject`
```json
{
  "id": 1,
  "semester": { "id": 1, "semester_number": 7 },
  "subject": { "id": 1, "code": "DAA", "name": "…" },
  "sections": [
    { "section_subject_id": 1, "section_id": 1, "section_name": "A",
      "faculty": { "id": 1, "name": "Faculty X", "email": "…" } }
  ],
  "created_at": "…"
}
```

### `SectionSubject`
```json
{
  "id": 1,
  "semester": { "id": 1, "semester_number": 7 },
  "section": { "id": 1, "name": "A" },
  "semester_subject_id": 1,
  "subject": { "id": 1, "code": "DAA", "name": "…" },
  "faculty": { "id": 1, "name": "Faculty X", "email": "…" },
  "faculty_assigned_at": "…",
  "created_at": "…",
  "updated_at": "…"
}
```

### `BulkResult`
Returned by bulk actions:
```json
{
  "succeeded": [3, 4],
  "failed": [ { "id": 1, "code": "ALREADY_ACTIVE", "message": "Already active." } ]
}
```

---

## 6. Permissions matrix

`SA` = Super Admin (with `X-College-Id` for college endpoints), `AD` = College Admin, `FA` = Faculty, `ST` = Student.

| Area | SA | AD | FA | ST |
|---|---|---|---|---|
| Auth, `/me` | ✔ | ✔ | ✔ | ✔ |
| `/platform/*` (colleges, college admins) | ✔ | — | — | — |
| `GET /college/` | ✔ | ✔ | ✔ | ✔ |
| Settings read | ✔ | ✔ | ✔ (read) | ✔ (read) |
| Settings update | ✔ | ✔ | — | — |
| Faculty, students, semesters, subjects, sections, mappings — **write** | ✔ | ✔ | — | — |
| Same — **read** | ✔ | ✔ | — | — |
| `GET /dashboard/` | ✔ | ✔ | — | — |
| `/my/*` faculty portal (own class sections & their students, own teaching) | — | — | ✔ | — |

Student views of their own team, phases and submissions arrive in Phase 2.

---

## 7. Auth endpoints

### `GET /auth/csrf/`  · public
Sets the `csrftoken` cookie. → `204`

### `POST /auth/login/`  · public · rate-limited (5/min per IP+email)
```json
{ "email": "riya@college.edu", "password": "Temp@1234" }
```
→ `200` sets `pms_access` + `pms_refresh`, body `{ "user": Me }`.
Errors: `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE`, `403 COLLEGE_INACTIVE`, `429 RATE_LIMITED`.
If `user.must_change_password` → send user to change-password screen.

### `POST /auth/refresh/`  · cookie
No body. Rotates both cookies. → `204`. Errors: `401 REFRESH_INVALID`.

### `POST /auth/logout/`
Revokes the refresh token, clears cookies. → `204` (also `204` if already logged out).

### `POST /auth/change-password/`  · any logged-in user
```json
{ "current_password": "Temp@1234", "new_password": "MyNew@Pass9" }
```
→ `200 { "user": Me }` (with `must_change_password: false`). Other sessions' refresh tokens are revoked; current session cookies are re-issued.
Errors: `400 VALIDATION_ERROR` (`current_password` wrong, policy failures, same as old).

### `POST /auth/password-reset/request/`  · public · rate-limited (3 per 10 min per email)
```json
{ "email": "riya@college.edu" }
```
→ `202` **always** (never reveals whether the email exists). If the account exists and is active, a 6-digit OTP is emailed immediately. OTP valid **10 minutes**; requesting again invalidates the previous OTP; resend allowed after **60 s**.

### `POST /auth/password-reset/verify/`  · public
```json
{ "email": "riya@college.edu", "otp": "482913" }
```
→ `200 { "reset_token": "opaque-string", "expires_in": 600 }`
Errors: `400 VALIDATION_ERROR` with `details.otp` = `["Invalid or expired code."]`. After **5** wrong attempts the OTP is burned → user must request a new one.

### `POST /auth/password-reset/confirm/`  · public
```json
{ "reset_token": "opaque-string", "new_password": "MyNew@Pass9" }
```
→ `204`. All sessions are revoked; user logs in with the new password. `must_change_password` becomes `false`.
Errors: `400 VALIDATION_ERROR` (`reset_token` invalid/expired, password policy).

---

## 8. Profile (`/me`)

### `GET /me/`
→ `200 Me`

### `PATCH /me/`
Editable by every role:
```json
{ "name": "Riya S.", "phone": "+919876543210" }
```
→ `200 Me`. `email`, `role`, `roll_number`, section/semester are read-only here (sending them → `400 VALIDATION_ERROR`).
`phone`: optional, 7–20 chars, digits with optional leading `+`, spaces/dashes stripped.

---

## 9. Super Admin — colleges & college admins

All require role `SUPER_ADMIN`. No `X-College-Id` needed here.

### `GET /platform/colleges/`
Query: `search` (name, code), `status`, `ordering` (`name`, `created_at`). → paginated `College` (with `stats`).

### `POST /platform/colleges/`
```json
{
  "name": "Sitare University",
  "code": "SITARE",
  "contact_email": "office@sitare.edu",
  "contact_phone": "+91…",
  "address": "…"
}
```
- `code`: 2–50 chars, `A–Z 0–9 -`, stored upper-case, unique.
- Creates the college as `ACTIVE` and its default `CollegeSettings`.

→ `201 College`. Errors: `409 CONFLICT` (code exists).

### `GET /platform/colleges/{id}/` → `200 College`

### `PATCH /platform/colleges/{id}/`
Any of `name`, `code`, `contact_email`, `contact_phone`, `address`. → `200 College`.

### `POST /platform/colleges/{id}/activate/` · `POST /platform/colleges/{id}/deactivate/`
→ `200 College`. Deactivating blocks login for **all** users of that college and revokes their sessions.

### `DELETE /platform/colleges/{id}/?confirm=<CODE>`
Hard-deletes the college and **everything** in it. `confirm` must equal the college `code`, else `400 VALIDATION_ERROR`. → `204`.

### College Admin (one per college)

| Method & path | Body | Result |
|---|---|---|
| `GET /platform/colleges/{id}/admin/` | — | `200 CollegeAdmin` · `404` if none |
| `POST /platform/colleges/{id}/admin/` | `{ "name", "email", "phone" }` | `201 CollegeAdmin` (status `INACTIVE`) · `409 CONFLICT` if the college already has an admin or the email is taken |
| `PATCH /platform/colleges/{id}/admin/` | `{ "name"?, "phone"? }` | `200 CollegeAdmin` |
| `DELETE /platform/colleges/{id}/admin/` | — | `204` (hard delete; then a new admin can be created) |
| `POST /platform/colleges/{id}/admin/activate/` | — | `200 CollegeAdmin` — sets `ACTIVE`, emails credentials |
| `POST /platform/colleges/{id}/admin/deactivate/` | — | `200 CollegeAdmin` — revokes sessions |
| `POST /platform/colleges/{id}/admin/resend-credentials/` | — | `202` — new temporary password emailed; `must_change_password` set to `true` |

### Credentials emails (applies to admins, faculty, students)
- Activating a College Admin, faculty member or student **emails their login credentials right away** (sent just after the request commits). Bulk activation sends one email per account in a single batch.
- If sending fails (SMTP down), or a very large bulk activation runs past ~20 s, the remaining emails stay queued and are retried automatically within ~5 minutes. Activation itself always succeeds.
- The temporary password is generated at send time and is never shown in the UI or stored in plain text. `resend-credentials` emails a new one the same way.
- UI copy: *"Account activated. Login details have been emailed."*
- `resend-credentials` only works on `ACTIVE` users (`409 CONFLICT` otherwise).
- `activate` on an already active user, or `deactivate` on an inactive one, returns `409 CONFLICT` (so credentials are never re-sent by accident; use `resend-credentials`).

---

## 10. College & settings

### `GET /college/`  · all roles
→ `200 College`. For Admin / Super Admin it also includes `admin` and `"stats": { "faculty": 40, "students": 900, "semesters": 8 }`; faculty and students get neither.

### `GET /settings/`  · all roles
→ `200 CollegeSettings`

### `PATCH /settings/`  · Admin, Super Admin
```json
{
  "min_team_size": 2,
  "max_team_size": 4,
  "default_mentor_capacity": 5,
  "team_formation_enabled": true,
  "teams_locked": false,
  "allow_cross_section_evaluation": false
}
```
Rules: `min_team_size ≥ 2`, `max_team_size ≥ min_team_size`, `max_team_size ≤ 20`, `default_mentor_capacity` 1–100.
Setting `teams_locked: true` stamps `teams_locked_at`. → `200 CollegeSettings`.
(Team settings take effect in Phase 2.)

---

## 11. Faculty

All Admin / Super Admin.

### `GET /faculty/`
Query: `search` (name, email), `status`, `ordering` (`name`, `created_at`, `last_login_at`). → paginated `Faculty`.

### `POST /faculty/`
```json
{ "name": "Faculty X", "email": "x@college.edu", "phone": "+91…" }
```
→ `201 Faculty` (status `INACTIVE`). Errors: `409 CONFLICT` email exists (anywhere in the system).

### `GET /faculty/{id}/` → `200 Faculty` (with `teaching`)

### `PATCH /faculty/{id}/`
`{ "name"?, "phone"? }` → `200 Faculty`. Email cannot change.

### `DELETE /faculty/{id}/`
Hard delete. Their class-teacher slots and section-subject assignments become **unassigned** (not deleted). → `204`.

### Status actions
| Path | Result |
|---|---|
| `POST /faculty/{id}/activate/` | `200 Faculty` + credentials emailed |
| `POST /faculty/{id}/deactivate/` | `200 Faculty`, sessions revoked |
| `POST /faculty/{id}/resend-credentials/` | `202` |
| `POST /faculty/bulk-activate/` body `{ "ids": [3, 4, …] }` (max 500) | `200 BulkResult` |
| `POST /faculty/bulk-deactivate/` body `{ "ids": [...] }` | `200 BulkResult` |

---

## 12. Students

All Admin / Super Admin.

### `GET /students/`
Query: `search` (name, email, roll number), `semester_id`, `section_id`, `status`, `ordering` (`name`, `roll_number`, `created_at`). → paginated `Student`.

### `POST /students/`
```json
{
  "name": "Riya Sharma",
  "email": "riya@college.edu",
  "phone": "+91…",
  "roll_number": "CSE22001",
  "section_id": 1
}
```
Semester is implied by the section. → `201 Student` (status `INACTIVE`).
Errors: `409 CONFLICT` (email taken anywhere / roll number taken in this college), `400` section not found.

### `GET /students/{id}/` → `200 Student`

### `PATCH /students/{id}/`
`{ "name"?, "phone"?, "roll_number"?, "section_id"? }` → `200 Student`.
`section_id` here is for correcting mistakes; moving a student to a new semester as part of progression is done by **promotion** (Phase 3), which keeps history.

### `DELETE /students/{id}/` → `204` (hard delete)

### Status actions
Same as faculty: `/activate/`, `/deactivate/`, `/resend-credentials/`, `/students/bulk-activate/`, `/students/bulk-deactivate/`.
Bulk body also accepts a filter instead of ids:
```json
{ "section_id": 1 }      // or { "semester_id": 1 }
```
Exactly one of `ids`, `section_id`, `semester_id`.

---

## 13. Semesters

All Admin / Super Admin.

| Method & path | Body / Query | Result |
|---|---|---|
| `GET /semesters/` | `ordering` (`semester_number`) | paginated `Semester` |
| `POST /semesters/` | `{ "semester_number": 7 }` (1–12) | `201 Semester` · `409 CONFLICT` if exists |
| `GET /semesters/{id}/` | — | `200 Semester` |
| `PATCH /semesters/{id}/` | `{ "semester_number": 8 }` | `200 Semester` · `409` if taken |
| `DELETE /semesters/{id}/` | — | `204` · `409 HAS_DEPENDENTS` if any section has students |

Deleting a semester removes its sections, offerings and mappings.

---

## 14. Subjects

All Admin / Super Admin.

| Method & path | Body / Query | Result |
|---|---|---|
| `GET /subjects/` | `search` (code, name), `semester_id` (offered in) | paginated `Subject` |
| `POST /subjects/` | `{ "code": "DAA", "name": "Design & Analysis of Algorithms" }` | `201 Subject` · `409` code exists in this college |
| `GET /subjects/{id}/` | — | `200 Subject` |
| `PATCH /subjects/{id}/` | `{ "code"?, "name"? }` | `200 Subject` |
| `DELETE /subjects/{id}/` | — | `204` — also removes all its semester offerings and section mappings |

`code`: 1–50 chars, stored upper-case.

---

## 15. Sections & class teachers

All Admin / Super Admin.

### `GET /sections/`
Query: `semester_id`, `search` (name), `has_class_teacher` (`true`/`false`), `ordering` (`name`). → paginated `Section`.

### `POST /sections/`
```json
{ "semester_id": 1, "name": "A", "class_teacher_id": null }
```
- `name`: 1–100 chars, trimmed, stored upper-case, unique within the semester.
- `class_teacher_id` is a **faculty id**, optional.

→ `201 Section`. Errors: `409 CONFLICT` (name exists in semester / faculty already class teacher in this semester).

### `GET /sections/{id}/` → `200 Section`

### `PATCH /sections/{id}/`
`{ "name"? }` → `200 Section`. A section cannot move to another semester.

### `DELETE /sections/{id}/`
→ `204` · `409 HAS_DEPENDENTS` if students are still in it (move or delete them first). Removes its subject mappings.

### Class teacher
| Method & path | Body | Result |
|---|---|---|
| `PUT /sections/{id}/class-teacher/` | `{ "faculty_id": 1 }` | `200 Section` · `409 CONFLICT` if that faculty is already class teacher of another section **in the same semester** (`message` names that section). Inactive faculty can be assigned (setup usually happens before accounts are activated). |
| `DELETE /sections/{id}/class-teacher/` | — | `200 Section` (unassigned) |

---

## 16. Semester subjects (offerings)

"Subject X is offered in Semester N." All Admin / Super Admin.

| Method & path | Body / Query | Result |
|---|---|---|
| `GET /semester-subjects/` | `semester_id`, `subject_id`, `search` (subject code/name, exact semester number, mapped section name, mapped faculty name) | paginated `SemesterSubject` |
| `POST /semester-subjects/` | `{ "semester_id": 1, "subject_id": 1 }` | `201 SemesterSubject` · `409` if already offered |
| `GET /semester-subjects/{id}/` | — | `200 SemesterSubject` |
| `DELETE /semester-subjects/{id}/` | — | `204` — also removes its section mappings (and, from Phase 2, its phases and teams) |

---

## 17. Section subjects & faculty assignment

"Section A of Semester 7 takes DAA, taught by Faculty X." All Admin / Super Admin.

### `GET /section-subjects/`
Query: `semester_id`, `section_id`, `semester_subject_id`, `subject_id`, `faculty_id`, `unassigned` (`true` = no faculty yet), `search` (subject code/name, section name, exact semester number, faculty name/email). → paginated `SectionSubject`.

`search` is split on spaces and every word must match some field (`daa yamini` = DAA rows taught by Yamini).

### `POST /section-subjects/`
```json
{ "section_id": 1, "semester_subject_id": 1, "faculty_id": null }
```
→ `201 SectionSubject`.
Errors: `400 VALIDATION_ERROR` section and offering belong to different semesters; `409 CONFLICT` already mapped.

### `POST /section-subjects/bulk/`
Map one offering to many sections at once (e.g. DAA → A, C, D):
```json
{
  "semester_subject_id": 1,
  "items": [
    { "section_id": 11, "faculty_id": 21 },
    { "section_id": 13, "faculty_id": 22 },
    { "section_id": 14, "faculty_id": null }
  ]
}
```
Valid items are created; invalid ones are reported. → `200`:
```json
{
  "created": [ SectionSubject, … ],
  "failed": [ { "section_id": 1, "code": "CONFLICT", "message": "Already mapped." } ]
}
```

### `GET /section-subjects/{id}/` → `200 SectionSubject`

### `PATCH /section-subjects/{id}/`
Assign, change or clear the faculty:
```json
{ "faculty_id": 1 }     // or null to unassign
```
→ `200 SectionSubject`. Only `faculty_id` can change; section and offering are fixed after creation. Inactive faculty can be assigned.

### `DELETE /section-subjects/{id}/` → `204`

---

## 18. Dashboards

### `GET /dashboard/`  · Admin, Super Admin
One call for the College Admin dashboard:
```json
{
  "counts": {
    "faculty": 40, "students": 900, "semesters": 8, "subjects": 24,
    "sections": 30, "semester_subjects": 26, "section_subjects": 70
  },
  "pending": {
    "inactive_faculty": 2,
    "inactive_students": 15,
    "sections_without_class_teacher": 1,
    "section_subjects_without_faculty": 3
  },
  "semesters": [
    { "id": 1, "semester_number": 7, "sections": 6, "subjects": 3, "students": 360 }
  ]
}
```

### `GET /my/dashboard/`  · Faculty
The logged-in faculty member's own work:
```json
{
  "faculty": { "id": 4, "name": "Faculty X", "email": "x@college.edu" },
  "counts": {
    "class_sections": 1, "class_students": 60, "class_students_inactive": 5,
    "teaching_assignments": 3, "teaching_subjects": 2, "teaching_students": 180
  },
  "class_sections": [
    { "section_id": 11, "section_name": "A", "semester_id": 1, "semester_number": 7,
      "students_count": 60, "inactive_students": 5, "subjects_count": 3 }
  ],
  "teaching": [
    { "section_subject_id": 31, "semester_id": 1, "semester_number": 7, "section_id": 11,
      "section_name": "A", "subject_id": 2, "subject_code": "DAA",
      "subject_name": "Design & Analysis of Algorithms", "students_count": 60 }
  ]
}
```
`teaching_students` counts a student once per assignment (a student taught two subjects counts twice).

---

## 19. Faculty portal (`/my/...`)

All require role `FACULTY` and only ever return the caller's own data; anything else is `404 NOT_FOUND`.

### Class teacher — my sections
| Method & path | Result |
|---|---|
| `GET /my/class-sections/` | paginated `Section` — sections where I am class teacher |
| `GET /my/class-sections/{id}/` | `200 Section` (with `students_count` and `subjects`) |

### Class teacher — students of my section
Base: `/my/class-sections/{section_id}/students/`. Same `Student` object and errors as §12, but:
- the section is fixed to `{section_id}` (no `section_id` in the body; it cannot be changed),
- **no delete** (`405`): deleting and moving students stays with the College Admin.

| Method & path | Body / Query | Result |
|---|---|---|
| `GET …/students/` | `search` (name, email, roll), `status`, `ordering` (`name`, `roll_number`, `created_at`) | paginated `Student` |
| `POST …/students/` | `{ "name", "email", "phone"?, "roll_number" }` | `201 Student` (`INACTIVE`) · `409 CONFLICT` email / roll number taken |
| `GET …/students/{id}/` | — | `200 Student` |
| `PATCH …/students/{id}/` | `{ "name"?, "phone"?, "roll_number"? }` | `200 Student` |
| `POST …/students/{id}/activate/` · `deactivate/` | — | `200 Student` (activation emails credentials) |
| `POST …/students/{id}/resend-credentials/` | — | `202` |
| `POST …/students/bulk-activate/` · `bulk-deactivate/` | `{ "ids": [3, 4] }` | `200 BulkResult` (students of other sections → `NOT_FOUND`) |

Every action is audited with the faculty member as actor.

### Teaching — my section-subject assignments (read-only)
| Method & path | Query | Result |
|---|---|---|
| `GET /my/teaching/` | `search` (subject code/name, section) | paginated `Teaching` |
| `GET /my/teaching/{id}/` | — | `200 Teaching` |
| `GET /my/teaching/{id}/students/` | `search` (name, email, roll), `status`, `ordering` (`name`, `roll_number`) | paginated `Student` (read-only) |

`Teaching`:
```json
{
  "id": 31,
  "semester": { "id": 1, "semester_number": 7 },
  "section": { "id": 11, "name": "A" },
  "subject": { "id": 2, "code": "DAA", "name": "Design & Analysis of Algorithms" },
  "class_teacher": { "id": 4, "name": "Faculty X", "email": "x@college.edu" },
  "students_count": 60,
  "faculty_assigned_at": "…",
  "created_at": "…"
}
```

---

## 20. System endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /health/` | public | `200 { "status": "ok", "time": "…" }` — Render health check |
| `GET /jobs/run/?token=<JOBS_SECRET>` | secret token | Called by UptimeRobot every 5 min; retries emails that could not be sent immediately (Phase 2 adds phase status updates). Returns `200 { "emails_sent": 12, "emails_failed": 0 }`. **Not used by the frontend.** |
| `GET /api/schema/` | public in dev, admin-only in prod | OpenAPI 3 schema |
| `GET /api/docs/` | same | Swagger UI |

(`/api/schema/` and `/api/docs/` sit outside `/api/v1`.)

---

## 21. Frontend integration checklist

- [ ] `vite.config.js` proxy `/api` → `http://localhost:8000`; `vercel.json` rewrite `/api/*` → Render.
- [ ] Axios instance: `baseURL: '/api/v1'`, `withCredentials: true`, request interceptor adds `X-CSRFToken` from `document.cookie` on unsafe methods.
- [ ] Response interceptor: on `401 TOKEN_EXPIRED` → single shared `POST /auth/refresh/` → retry once; on `REFRESH_INVALID` → clear user, go to `/login`.
- [ ] On `403 PASSWORD_CHANGE_REQUIRED` → go to `/change-password`.
- [ ] Super Admin "manage college" mode stores the chosen college id in context and sends `X-College-Id` on every college-scoped call.
- [ ] Route guards by `role`: `SUPER_ADMIN` → `/platform/*`, `ADMIN` → `/admin/*`, `FACULTY` → `/faculty/*`, `STUDENT` → `/student/*`.
- [ ] Forms map `error.details` to fields; toasts show `error.message`.
- [ ] Never show or store passwords/tokens; activation copy says credentials arrive by email.
- [ ] Mock server: until the backend is up, mock these endpoints (e.g. MSW) using the shapes in section 5.

---

## 22. Bulk delete

`POST {list}/bulk-delete/` with `{ "ids": [3, 4, …] }` (max 500) → `200 BulkResult`. Admin / Super Admin.

Available on `/faculty/`, `/students/`, `/semesters/`, `/subjects/`, `/sections/`, `/semester-subjects/`, `/section-subjects/`.
Each id is deleted on its own (same rules and audit record as the single `DELETE`), so one blocked row never stops the rest:

| `failed[].code` | When |
|---|---|
| `NOT_FOUND` | id doesn't exist in this college |
| `HAS_DEPENDENTS` | e.g. a section (or a semester whose sections) still has students |

Class teachers can't use it on `/my/class-sections/{id}/students/` (`405`).

---

## 23. CSV imports

Admin / Super Admin. Upload CSV files to create data in bulk. **Only valid rows are saved**; every other row is reported with the reason. Each row goes through the same validation as the single-record API.

| Method & path | Result |
|---|---|
| `GET /imports/` | `{ "results": [ { "kind", "label", "description", "columns": [ { "name", "required", "help" } ] } ] }` in dependency order |
| `GET /imports/{kind}/template/` | `text/csv` attachment: header row + example rows |
| `POST /imports/{kind}/?dry_run=true` | multipart `file` — validate and preview; **nothing is saved** |
| `POST /imports/{kind}/` | multipart `file` — import the valid rows |

Kinds (import in this order — each only refers to data from the ones before it):

| `kind` | Columns (`*` required) | Notes |
|---|---|---|
| `faculty` | `name*`, `email*`, `phone` | Created `INACTIVE`; activate to email credentials |
| `semesters` | `semester_number*` | 1–12; `7`, `Sem 7` and `Semester 7` all work |
| `subjects` | `code*`, `name*` | Code is upper-cased |
| `sections` | `semester*`, `section*`, `class_teacher_email` | Existing section + email → assigns/changes the class teacher (`updated`); without email → `skipped` |
| `students` | `name*`, `email*`, `roll_number*`, `semester*`, `section*`, `phone` | Section must exist in that semester; created `INACTIVE` |
| `subject-mappings` | `semester*`, `subject_code*`, `section*`, `faculty_email` | Offers the subject in the semester if needed; existing mapping + email → changes the faculty (`updated`) |

File rules: UTF-8 (Excel's Windows "CSV" encoding is also accepted), ≤ 2 MB, ≤ 2000 data rows. Header names are case-insensitive; unknown columns are ignored and listed in `ignored_columns`; blank lines are skipped.
A missing required column, an empty file or a file over the limits → `400 VALIDATION_ERROR` with `details.file`.

Response (dry run and real import have the same shape):
```json
{
  "kind": "students",
  "dry_run": true,
  "total": 3,
  "created": 1, "updated": 0, "skipped": 0, "error": 2,
  "ignored_columns": ["notes"],
  "rows": [
    { "row": 2, "status": "created", "message": "Asha added to Semester 7, section A (inactive).", "data": { "name": "Asha", … } },
    { "row": 3, "status": "error", "message": "section: Section Z does not exist in Semester 7. Import or create it first.",
      "errors": { "section": "Section Z does not exist in Semester 7. Import or create it first." }, "data": { … } }
  ]
}
```
`row` is the line number in the file (the header is line 1). `status` is `created` / `updated` / `skipped` / `error`.
A real import writes one `import.{kind}` audit record plus the usual per-record audit records.

---

## 24. Phase 2 — phases, mentors, teams, submissions, evaluations

Dates are calendar days in `TIME_ZONE` (default `Asia/Kolkata`), both ends inclusive. Students never receive marks
from any endpoint.

### Phase status (computed on every read; the job keeps the stored copy current)
| Status | When |
|---|---|
| `UPCOMING` | today < `start_date` |
| `OPEN` | `start_date` ≤ today ≤ `end_date` — submissions allowed |
| `CLOSED` | today > `end_date` — evaluators enter marks |
| `LOCKED` | locked by the Admin, or automatically after `evaluation_end_date` (not again once the Admin unlocks it) |

### Phases · Admin
| Method | Path | Notes |
|---|---|---|
| GET/POST | `/phases/` | filters `semester_id`, `semester_subject_id`, `subject_id`, `status`; rows carry `stats` |
| GET/PATCH/DELETE | `/phases/{id}/` | PATCH refused while LOCKED; DELETE cascades submissions, assignments, marks |
| POST | `/phases/bulk-delete/` | BulkResult |
| POST | `/phases/{id}/lock/` · `/phases/{id}/unlock/` | lock only when CLOSED |
| POST | `/phases/reorder/` | `{semester_subject_id, ids: [every phase id, in order]}` |

Overlapping dates within a subject → `409 CONFLICT` (backed by a Postgres exclusion constraint). Also
`end_date > start_date`, `evaluation_end_date ≥ end_date`, `max_marks > 0`, unique name per subject. Creating a phase
gives every existing team its default evaluator for it.

### Mentor list · Admin
| Method | Path | Notes |
|---|---|---|
| GET | `/semester-mentors/?semester_id=` | rows: `faculty`, `capacity`, `load` (= accepted teams), `accepted`, `pending`, `free` |
| POST | `/semester-mentors/` | `{semester_id, faculty_ids: [], capacity?}` (default from settings) → `{created, failed}` |
| PATCH | `/semester-mentors/{id}/` | `{capacity}`; can't go below accepted teams; reaching it auto-rejects waiting requests |
| — | CSV import `mentors` | `semester, faculty_email, capacity?` per row (many semesters in one file); see §23 |
| DELETE | `/semester-mentors/{id}/` · `POST /semester-mentors/bulk-delete/` | blocked while they hold teams (`HAS_DEPENDENTS`) |

### Teams · Admin (works even when teams are locked)
| Method | Path | Body / notes |
|---|---|---|
| GET | `/teams/` | filters `semester_id`, `semester_subject_id`, `subject_id`, `section_id`, `mentor_id`, `evaluator_id`, `incomplete`, `has_mentor`, `mentor_pending`, `evaluator_pending`; `search` |
| POST | `/teams/` | `{semester_subject_id, lead_id, member_ids?}` |
| GET/PATCH/DELETE | `/teams/{id}/` | PATCH `{name}` only |
| POST | `/teams/{id}/add-member/` · `/remove-member/` · `/change-lead/` | `{student_id}` |
| POST | `/teams/{id}/assign-mentor/` | `{faculty_id, replace=true, override_capacity=false}` |
| POST | `/teams/{id}/remove-mentor/` | `{assignment_id}` |
| POST | `/teams/{id}/set-evaluator/` | `{evaluator_id or null, phase_ids?}`; null resets to AUTO; no `phase_ids` = every unlocked phase. With cross-section evaluation off, the faculty must teach this subject in a section of a team member |
| GET | `/teams/unassigned-students/?semester_subject_id=` | eligible students with no team for that subject |

`Team`: `{id, name, display_name, semester_subject, lead, members[{…student, role, joined_at}], members_count,
is_complete, mentors[{id, faculty, status}], evaluators[{id, phase, evaluator, source}], evaluator_pending,
pending_invites[]}`.

### Evaluations · Admin
`GET /evaluations/` (filters `semester_id`, `semester_subject_id`, `phase_id`, `team_id`, `evaluator_id`,
`evaluator_pending`, `evaluated`) → rows `{id, phase, semester_subject, team, evaluator, source, submission,
evaluation, max_marks, can_edit_marks}`. `PUT /evaluations/{id}/marks/` (same body as the evaluator's) corrects marks the
evaluator already entered (phase CLOSED, not locked). The Admin can't create an evaluation.

### Student portal
| Method | Path | Notes |
|---|---|---|
| GET | `/my/projects/` | `{settings, student, subjects: [{semester_subject, team, is_lead, invites, phases[{…, submission, submission_progress, evaluation_start_date, evaluation_end_date, evaluation_progress}]}]}` — progress is PENDING/SUBMITTED and PENDING/COMPLETED; evaluation starts the day after the end date |
| GET/POST | `/my/teams/` | POST `{semester_subject_id}` → I become Team Lead |
| GET/DELETE | `/my/teams/{id}/` | DELETE = lead disbands (before the lock, nothing submitted) |
| GET | `/my/teams/{id}/eligible-students/` | lead only |
| POST | `/my/teams/{id}/invite/` `{student_id}` · `/cancel-invite/` `{invite_id}` | lead only |
| POST | `/my/teams/{id}/remove-member/` · `/change-lead/` `{student_id}` · `/leave/` | |
| GET | `/my/teams/{id}/mentors/` | the semester's mentor list, each `{faculty, available}` (no counts) |
| POST | `/my/teams/{id}/request-mentor/` `{faculty_id}` · `/cancel-mentor-request/` | lead only; team must be at the minimum size; refused if the mentor is full |
| GET | `/my/teams/{id}/invite-history/` | lead only: every invite and its answer (`status`, `is_automatic` = cancelled because the student joined another team, `responded_at`) |
| GET | `/my/teams/{id}/mentor-requests/` | lead only: every request of the team and how it ended (`status`, `note`, `is_automatic`, `by_admin`) |
| GET/PUT | `/my/teams/{id}/phases/{phase_id}/submission/` | PUT `{links: [{link_type, url, title?}], notes?, submit=true}` replaces the links; OPEN only |
| GET | `/my/invites/` · POST `/my/invites/{id}/accept/` · `/decline/` | accepting cancels my other invites for that subject |

Students change teams only while `team_formation_enabled` is on and `teams_locked` is off.

### Faculty portal
| Method | Path | Notes |
|---|---|---|
| GET | `/my/mentoring/` | pending requests + accepted teams (`?status=` for one status) |
| GET | `/my/mentoring/{id}/` | includes `phases` with submissions once accepted (no marks) |
| POST | `/my/mentoring/{id}/accept/` · `/reject/` | `{note?}`; an accept that fills the last slot rejects the mentor's other pending requests (`is_automatic`) |
| GET | `/my/mentoring/history/` | every answered/ended request, newest first (paginated) |
| GET | `/my/evaluations/` · `/my/evaluations/phases/` | teams I evaluate; phase picker with progress counts |
| PUT | `/my/evaluations/{id}/marks/` | `{default_marks?, student_marks?: [{student_id, marks}], remarks?, submit=true}` — marks are **per student**: `default_marks` applies to every member not listed in `student_marks`; every member must end up with 0..max; CLOSED only; no submission ⇒ all 0. Response `evaluation`: `{default_marks, student_marks[{student_id, name, roll_number, marks}], summary{min,max,avg}, …}` |
| POST | `/my/evaluations/{id}/team-name/` | `{name}` (unique per subject) |
| GET | `/my/class-sections/{id}/teams/{student_id}/` | class teacher: one student — per subject `team`, `phases[{…, evaluator, marks, evaluation_status, remarks, submission_progress, evaluation_progress}]`, `totals{marks, max_marks}` |
| GET | `/my/class-sections/{id}/teams/` | class teacher: every student × subject → team, role, mentors, evaluator per phase |

### Enforced by the database
One team per student per subject, one pending invite per team + student, one active mentor assignment per
team + faculty, one evaluator assignment per team + phase, no overlapping phase dates, marks within `0..max_marks`,
a Team Lead can't be deleted (`RESTRICT`).

### Job
`GET /jobs/run/?token=` also returns `phases_updated` and `phases_auto_locked`.

### Mentor capacity (updated)
Only ACCEPTED teams use a mentor's slots. Several teams may have PENDING requests to the same mentor; the mentor
chooses. When an accept (or an Admin assignment, or lowering the capacity) fills the last slot, all other PENDING
requests to that mentor in that semester become REJECTED with `is_automatic = true`.

### Emails
Activation and password-reset emails are sent on a background thread after the request commits
(`EMAIL_ASYNC`, default on; off under `manage.py test`). Failed sends stay in the outbox for the job.

### Frontend refresh
Every page refetches its data every 10 s while the tab is visible; the header's refresh button refetches now.
