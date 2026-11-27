# PMS — Project Management System
## Product Requirements Document (Internal)

> **INTERNAL — do not share with colleges.**
> This document describes the full multi-college platform, including the Super Admin layer and tenancy design. The college-facing version is `PRD_for_college.md`.

| | |
|---|---|
| **Project** | Group 34 Major Project — Project Management System (PMS) |
| **Team** | Atharva Raj Sinha & Megha Kanyal |
| **Product type** | Multi-college SaaS web application + Progressive Web App (PWA) |
| **Users** | Super Admin (platform), College Admin, Faculty, Students |
| **Initial target** | B.Tech CSE |
| **Document status** | Draft v1 — 2026-10-22 |

---

## Table of Contents
1. [Introduction](#1-introduction)
2. [Objectives](#2-objectives)
3. [Platform & Tenancy Model](#3-platform--tenancy-model)
4. [User Roles](#4-user-roles)
5. [Academic Structure](#5-academic-structure)
6. [Class Coordinator Assignment](#6-class-teacher-assignment)
7. [Account Management](#7-account-management)
8. [Authentication & Security](#8-authentication--security)
9. [College Settings](#9-college-settings)
10. [Project Phases](#10-project-phases)
11. [Team Formation](#11-team-formation)
12. [Team Locking](#12-team-locking)
13. [Mentor Selection](#13-mentor-selection)
14. [Evaluator Assignment](#14-evaluator-assignment)
15. [Phase Submissions & Links](#15-phase-submissions--links)
16. [Evaluation & Marks](#16-evaluation--marks)
17. [Notifications](#17-notifications)
18. [Email System](#18-email-system)
19. [Push Notifications](#19-push-notifications)
20. [Student Promotion & Semester-End Reset](#20-student-promotion--semester-end-reset)
21. [Hard Delete](#21-hard-delete)
22. [Bulk CSV Operations](#22-bulk-csv-operations)
23. [Reports](#23-reports)
24. [Dashboards](#24-dashboards)
25. [Audit Logs](#25-audit-logs)
26. [Background Jobs](#26-background-jobs)
27. [Business Rules](#27-business-rules)
28. [End-to-End Workflow](#28-end-to-end-workflow)
29. [Data Model](#29-data-model)
30. [Technology Stack & Deployment](#30-technology-stack--deployment)
31. [Delivery Roadmap](#31-delivery-roadmap)
32. [Future Expansion](#32-future-expansion)
33. [Key Benefits](#33-key-benefits)
34. [Assumptions & Open Items](#34-assumptions--open-items)

---

## 1. Introduction
PMS is a centralized platform that manages the complete lifecycle of academic projects in colleges. It replaces spreadsheets, paper submissions, manual team formation, mentor allocation, evaluation tracking, marks management and report preparation.

PMS is built as a **multi-college platform**. Each college is an isolated tenant with its own College Admin, faculty, students and academic data. The platform owner operates a **Super Admin** account that onboards and manages colleges.

> The college-facing PRD intentionally describes a single college with "exactly one Admin". From a college's point of view that is accurate; the multi-college layer is never exposed to colleges.

Faculty work as **Mentors** and **Evaluators**; students work as **Team Leads** or **Team Members**. The system covers academic setup, team formation, mentor assignment, phase submissions, evaluation, notifications, reporting and student promotion.

## 2. Objectives
- Centralize academic project management across multiple colleges.
- Reduce manual administrative work.
- Automate project team formation.
- Provide fair FCFS-based mentor allocation.
- Automate evaluator assignment.
- Manage project phases and deadlines.
- Digitize evaluation and marks management.
- Provide centralized notifications (in-app, email, push).
- Generate downloadable reports.
- Support bulk data creation through CSV.
- Maintain audit records of important activities.
- Provide a responsive PWA for desktop and mobile.

## 3. Platform & Tenancy Model
### 3.1 Tenancy
- **Shared database, shared schema.** Every tenant-owned record is scoped by `college_id`, either directly (users, faculty, students, semesters, subjects, college settings, audit logs, email outbox) or through its parent (sections → semester → college, etc.).
- Every API request is resolved to a college:
  - College Admin / Faculty / Student → the college of the logged-in user.
  - Super Admin → the college given in the `X-College-Id` request header (for college-scoped endpoints).
- All querysets are filtered by the resolved college. Cross-college access is impossible for non-Super-Admin users.

### 3.2 Login
- **One shared login URL** for all colleges and roles.
- **Email is globally unique** across the platform, so the college is derived from the user's account. No college picker or subdomain.

### 3.3 College lifecycle
- The Super Admin creates a college, which automatically creates its default `college_settings` row.
- The Super Admin creates the college's single **College Admin**, who receives an activation email.
- A college can be **ACTIVE** or **INACTIVE**. Users of an inactive college cannot log in.

## 4. User Roles
### 4.1 Super Admin (platform)
- Exactly one platform-level account, with `college_id = NULL`.
- **Created automatically on every server start** from environment variables (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`). The step is idempotent: it creates the account if missing and does nothing if it exists. It runs after `migrate` in the Render start command.
- Can:
  - Create, view, update, activate/deactivate and delete colleges.
  - Create, update, activate/deactivate and delete each college's College Admin.
  - **View and manage any college's data** (acting with the same powers as that college's Admin, via `X-College-Id`).
  - View audit logs platform-wide.

### 4.2 College Admin ("Admin" in the college PRD)
Exactly one per college. System-wide control within the college. Can:
- Add faculty and students; activate/deactivate accounts; hard delete users.
- Manage semesters and subjects.
- Create semester-specific sections; assign exactly one Class Coordinator per section; change or remove Class Coordinator assignments.
- Assign students to sections.
- Offer subjects in semesters; map subjects to sections; assign faculty to section-subjects.
- Define the **mentor list per semester** and mentor capacities.
- Configure college settings (team size, mentor capacity default, team formation, global team lock, cross-section evaluation).
- Create and manage project phases; lock/unlock phases and evaluations.
- Override evaluator assignments; reassign mentors; modify locked teams.
- Update marks when a phase is unlocked for correction.
- **Promote students (Admin only).**
- Send notifications; perform bulk CSV operations.
- Generate and download reports; view audit logs.

The Admin **cannot act as an evaluator**.

### 4.3 Faculty
**As Mentor:**
- Be selected by teams (if on the semester mentor list and below capacity).
- Accept or reject mentor requests.
- View and work with mentored teams; receive team-related notifications.

**As Evaluator:**
- View assigned evaluation teams and submission status.
- **Set/change team names** of their evaluation teams.
- Enter marks, submit evaluations.
- Send notifications to their evaluation teams.

A faculty member can be both mentor and evaluator simultaneously.

### 4.4 Student
- Log in with email and password; change the temporary password on first login.
- For each project subject they take: create a team (becoming Team Lead) or join another team.
- Select a mentor for their team.
- Submit phase work as links.
- Receive in-app and push notifications.
- **Cannot see marks.**

A student belongs to one current semester and one section in it. A student can belong to **one active team per semester-subject**.

## 5. Academic Structure
```
College
 ├── Semester (reused for every batch; no academic year)
 │    ├── Sections (A, B, C… — names unique within the semester; one Class Coordinator each)
 │    │     └── Students (exactly one current section)
 │    └── Semester-Subjects (subjects offered in the semester — every subject is a project subject)
 │          ├── Section-Subjects (which sections take it) → exactly one Faculty each
 │          ├── Phases
 │          └── Teams  (one team per student per semester-subject)
 └── Subjects (college-wide catalogue, reusable across semesters)
```

### 5.1 Rules
- Semesters and subjects are reusable. Semester numbers are unique within a college (1–12).
- A subject can be offered in multiple semesters (`semester_subjects`).
- **All subjects are project subjects.**
- Each section belongs to exactly one semester; section names are unique within a semester, not globally (Sem 7 A ≠ Sem 8 A).
- A student belongs to one section in their current semester; sections are not subject-specific.
- A semester-subject can be mapped to any subset of that semester's sections.
- Each section-subject has exactly one assigned faculty member. The mapping can exist before the faculty is assigned (so CSVs can be imported in two steps).
- The same subject can have different faculty in different sections; a faculty member can teach many section-subjects.
- Phases belong to the semester-subject and are shared by all its sections.

### 5.2 Example (Semester 7)
| Subject | Sections | Section-subject faculty |
|---|---|---|
| DAA | A, C, D | A → X, C → Y, D → X |
| DSA | A, B, C, D | A → Y, B → Z, C → X, D → X |
| AI/ML | B | B → Y |

- Students of A, C, D form **DAA teams** among themselves.
- Students of A, B, C, D form **DSA teams** among themselves — separate teams from DAA.
- Only Section B students form **AI/ML teams**.
- A Section A student is therefore in one DAA team and one DSA team; a Section B student is in one DSA team and one AI/ML team.

## 6. Class Coordinator Assignment
- Every semester-section must have exactly one Class Coordinator before the semester's required workflow begins (a section may be created first and assigned later).
- Any faculty member of the college can be Class Coordinator; it is independent of teaching assignments.
- A faculty member may be Class Coordinator of several sections in **different** semesters, but at most one section in the **same** semester.
- Assignment is per semester-section record and never carries over to another semester.
- Managed by the Admin. If the faculty member is deleted, the section's Class Coordinator becomes empty.

## 7. Account Management
### 7.1 Common user fields
All users have: name, email (globally unique, case-insensitive, **cannot be changed**), phone, role, status.

### 7.2 Students
Created by Admin with: **Name, Email, Roll Number, Semester, Section, Phone**. (No batch field.)
- Roll number unique within the college.
- Section must belong to the selected semester.

### 7.3 Faculty
Created by Admin with: **Name, Email, Phone**.

### 7.4 College Admin
Created by Super Admin with: **Name, Email, Phone**.

### 7.5 Activation
- **All accounts are created INACTIVE.**
- On activation (College Admin, faculty, student — single or bulk), an `ACCOUNT_ACTIVATION` email is recorded and **sent immediately after the request commits**. The **temporary password is generated at send time** (never stored in plain text), set on the account, and emailed.
- If sending fails, or a large bulk activation exceeds the ~20 s send budget, the rest stay in the outbox and the scheduled job retries them (~5 minutes).
- The user must change the temporary password on first login.

### 7.6 Profile
Every role can view and update their own profile (name, phone) and change their password. Email is read-only.

## 8. Authentication & Security
- Email + password login.
- **JWT (simplejwt) stored in httpOnly, Secure cookies** (access + refresh). The frontend proxies `/api/*` through its own origin (Vercel rewrite in prod, Vite proxy in dev) so cookies stay first-party with `SameSite=Lax` despite Vercel and Render being different domains; CSRF protection enabled (`X-CSRFToken` header). Logout blacklists the refresh token.
- Temporary password with mandatory first-login change (`must_change_password`).
- Forgot password via **email OTP** (hashed, expiring, attempt-limited) → reset password.
- Inactive users and users of inactive colleges cannot log in.
- Role-based access control: SUPER_ADMIN, ADMIN, FACULTY, STUDENT.
- Users cannot change their registered email.

## 9. College Settings
One settings record per college, edited by the College Admin:

| Setting | Default | Notes |
|---|---|---|
| `min_team_size` | 2 | ≥ 2 (Team Lead + at least one member) |
| `max_team_size` | 4 | ≥ min_team_size |
| `default_mentor_capacity` | 5 | Used when adding faculty to a semester mentor list |
| `team_formation_enabled` | false | Students can create/join teams only when on |
| `teams_locked` (+ `teams_locked_at`) | false | Global team lock |
| `allow_cross_section_evaluation` | false | Allows evaluators outside their own section |

Settings are configured in Phase 1 and enforced in Phase 2.

## 10. Project Phases
Each semester-subject has multiple phases. A phase has: name, short description, detailed description, start date, end date, optional evaluation end date, status, maximum marks, display order, lock information.

Example: *Phase 1: Project Proposal — 01/09/2026 to 15/09/2026 — Max marks 20.*

### 10.1 Status
| Status | Meaning |
|---|---|
| `UPCOMING` | Before start date |
| `OPEN` | Submissions allowed |
| `CLOSED` | Past end date — submissions closed, evaluation allowed |
| `LOCKED` | Evaluation locked — no mark changes |

- **`end_date` closes submissions** automatically.
- **Evaluation lock** is separate: set manually by Admin, or automatically at `evaluation_end_date` if set.
- Admin can lock/unlock manually (unlock for corrections).
- Status is kept current by the scheduled job and by Admin actions; submission checks also compare dates directly so job delay never allows late submissions.

### 10.2 Rules
- Phases belong to a semester-subject.
- Phases cannot overlap within a semester-subject (database exclusion constraint).
- Phase names unique within a semester-subject; `end_date > start_date`; `evaluation_end_date ≥ end_date`; `max_marks > 0`.
- Admin can reorder and hard delete phases (associated data is deleted).

## 11. Team Formation
- **Teams are per semester-subject.**
- Eligible students: those whose section is mapped to that semester-subject.
- A student can be in **one active team per semester-subject** (so in as many teams as the project subjects they take).
- Members may come from different eligible sections; formation is not section-bound.
- Every team has exactly one Team Lead; Team Lead + at least one member is compulsory.
- Team size must satisfy the college's min/max.
- Students can create/join teams only when `team_formation_enabled` is on.
- **Team name is set/changed by the team's Evaluator** (or Admin), not by students.

## 12. Team Locking
- Team locking is **global per college** (`teams_locked`).
- After locking: no members added/removed, Team Lead cannot change, membership is frozen, and evaluator changes caused by team changes cannot happen.
- Only the Admin can modify a locked team.
- Before locking, changing the Team Lead recalculates the default evaluator.

## 13. Mentor Selection
- The Admin defines a **mentor list per semester**: which faculty can mentor in that semester, each with a **capacity** (number of teams), defaulting to the college's `default_mentor_capacity`.
- Teams pick a mentor from that list, **first come, first served** within capacity.
- A faculty member at capacity is unavailable for new normal assignments.
- The mentor accepts or rejects; on rejection the team can choose another available mentor.
- Admin can reassign mentors and, in special cases, assign multiple mentors with identical permissions.
- Normally one mentor per team.
- Capacity enforcement is **concurrency-safe and transactional** (row locking).

## 14. Evaluator Assignment
Default evaluator:
```
Semester → Subject → Team Lead's Section → Faculty assigned to that Section + Subject
```
Example: Sem 7, DAA, Team Lead in Section A, DAA + A → Faculty X ⇒ evaluator is Faculty X.

- The faculty always exists structurally because the Team Lead must be in a section mapped to that subject. If no faculty has yet been assigned to that section-subject, the team is flagged to the Admin as "evaluator pending".
- Team Lead change before lock → evaluator recalculated.
- Admin can override the evaluator and may allow evaluation outside the evaluator's own section (`allow_cross_section_evaluation`).
- One evaluator per team per phase; assignment is phase-specific.
- The Admin can never be an evaluator.

## 15. Phase Submissions & Links
- One submission record per team per phase, containing one or more links.
- Link types: Repository, Documentation, Demo, Presentation, Google Drive, Google Form, etc.
- Links are stored separately from the submission record.
- Students can update the submission while the phase is OPEN.
- No dynamic forms and no file-upload tables in current scope.

## 16. Evaluation & Marks
- One evaluator per team per phase; one evaluation per team-phase assignment.
- Marks are stored directly on the evaluation (the separate marks table was merged).
- Marks cannot exceed the phase's maximum marks.
- **If a team never submits, the evaluator records 0 marks** (evaluation exists without a submission).
- Evaluators can enter/edit marks while the phase is CLOSED and not LOCKED; after lock, no changes.
- Admin can unlock a phase for corrections and update marks.
- All mark changes are audited.
- **Students cannot see marks; marks are never released to students.**

## 17. Notifications
Channels: **in-app, email, push**. The sender chooses channels.

| Sender | Can notify |
|---|---|
| Faculty | Their evaluation teams, Admin |
| Admin | All faculty, all students, selected semesters, selected sections, specific groups |

Notifications are sent immediately (email delivery via the outbox job) and can include title, message, attachment path, link, priority and expiry date.

## 18. Email System
- **Gmail SMTP in development, Brevo in production.**
- Credentials emails are recorded in an **email outbox** table, sent immediately, and retried by a scheduled job endpoint if sending fails.
- Used for: account activation, temporary passwords, OTP, password reset, notifications, phase deadlines, evaluation updates.

## 19. Push Notifications
- The PWA supports native Web Push on supported devices.
- Device subscriptions are stored per user.
- Delivery depends on the sender's chosen channels and the user's device permission.

## 20. Student Promotion & Semester-End Reset
### 20.1 Promotion (Admin only)
1. Required semester data is downloaded.
2. Admin confirms the promotion (individually or section-wise).
3. The existing student account is updated (not re-created) with the new semester and section.
4. Previous semester and section are saved in promotion history.
5. Existing marks are deleted after the download.

### 20.2 Semester-end reset
Semesters are reused for every batch (no academic year). After the Admin downloads all data:
- **Wiped:** teams, team members, mentor assignments, evaluator assignments, submissions, links, evaluations/marks.
- **Kept:** semesters, subjects, sections, class coordinators, subject mappings, faculty assignments, phases (dates edited for the next batch), mentor lists.

## 21. Hard Delete
- No soft deletes anywhere.
- Hard deletion removes records and cascades according to defined relationships.
- Safety rules:
  - A **section with students cannot be deleted** (move or delete the students first).
  - A **Team Lead cannot be deleted** while leading a team (reassign first).
  - References to "who did it" (assigned by, created by, promoted by, locked by, audit actor) become **empty (SET NULL)** instead of deleting history.
  - Deleting a submitting student does not delete the team's submission.
  - Promotion history keeps snapshot information if old semesters/sections are deleted.
  - Deleting a faculty member empties their Class Coordinator and section-subject assignments.

## 22. Bulk CSV Operations
Supported: students, faculty, semesters, subjects, sections, section-subject mappings, faculty assignments, Class Coordinator assignments.

Workflow: **Download template → Prepare CSV → Upload → Validate → Preview → Import → Results**.

- **Partial import:** valid rows are imported, invalid rows are reported.
- Validation, duplicate detection, success/failure counts, row-level errors, downloadable error CSV.
- Student rows include semester and section; sections are validated against the semester.
- Faculty assignments are per section + subject; Class Coordinator rows per semester + section with an existing faculty.
- No dedicated import tracking tables; import actions are recorded in audit logs.

## 23. Reports
Downloadable, generated from relational data:
- **Students:** lists, semester breakdowns, section breakdowns, promotion data.
- **Faculty:** lists, teaching assignments, Class Coordinator assignments, mentoring assignments, evaluation assignments.
- **Teams:** lists, members, Team Leads, members' sections, mentors, evaluators.
- **Phases & evaluation:** phase status, pending evaluations, evaluator marks, audit information.
- **Bulk imports:** summaries, failed records, validation errors.

## 24. Dashboards
UI views only; no dashboard tables.
- **Super Admin:** colleges, college status, user counts per college, platform activity.
- **College Admin:** students, faculty, semesters, subjects, sections, Class Coordinator coverage, active teams, mentors, phase statuses, pending evaluations, recent audit logs.
- **Faculty:** Class Coordinator sections, teaching section-subjects, mentoring teams, evaluation teams, submission counts, pending evaluations.
- **Student:** current semester and section, teams per subject, mentors, evaluators, phase deadlines, submission status.

## 25. Audit Logs
Each entry records: college, actor, **actor role**, action, entity type, entity ID, previous value, new value, **IP address**, **user agent**, timestamp.

Tracked: user operations, college operations (Super Admin), hard deletes, team locking, mentor changes, evaluator changes, phase lock/unlock, marks submission/edits, promotion, CSV imports, notification actions, configuration changes.

## 26. Background Jobs
- No Celery/queue worker. Jobs are **HTTP endpoints protected by a secret token in the URL**, called by **UptimeRobot** (~every 5 minutes).
- Jobs:
  - Retry outbox emails that could not be sent immediately (activation emails with temp-password generation, notifications). Password-reset OTPs are sent directly in the request.
  - Update phase statuses / auto-lock evaluation at `evaluation_end_date` (Phase 2).
- Jobs are idempotent and safe to run repeatedly.

## 27. Business Rules
| # | Rule |
|---|---|
| 1 | PMS hosts multiple colleges; each college's data is isolated. |
| 2 | There is exactly one Super Admin, created automatically from environment variables. |
| 3 | The Super Admin can view and manage any college. |
| 4 | Each college has exactly one College Admin. |
| 5 | The Admin cannot act as an evaluator. |
| 6 | Email is unique across the whole platform and cannot be changed. |
| 7 | All users log in through one shared login URL. |
| 8 | Accounts are created inactive; activation emails a temporary password. |
| 9 | Temporary passwords must be changed on first login. |
| 10 | Users of an inactive college cannot log in. |
| 11 | Student roll numbers are unique within a college. |
| 12 | A student has one current semester and exactly one section in it. |
| 13 | A section belongs to exactly one semester. |
| 14 | Section names are unique within a semester. |
| 15 | Sections are not subject-specific. |
| 16 | Sem 7 Section A and Sem 8 Section A are different records. |
| 17 | Semesters and subjects are reused across batches; there is no academic year. |
| 18 | All subjects are project subjects. |
| 19 | A subject can be offered in multiple semesters. |
| 20 | A semester-subject can be mapped to any subset of its semester's sections. |
| 21 | Each section-subject has exactly one assigned faculty member. |
| 22 | The same subject can have different faculty in different sections. |
| 23 | A faculty member can teach multiple section-subjects. |
| 24 | Every section must have exactly one Class Coordinator before the workflow begins. |
| 25 | A Class Coordinator can be any faculty and need not teach in that section. |
| 26 | A faculty member is Class Coordinator of at most one section per semester. |
| 27 | Class Coordinator assignments do not carry over between semesters. |
| 28 | The Admin manages Class Coordinator assignments. |
| 29 | College settings (team size, mentor capacity, team formation, team lock, cross-section evaluation) are college-wide and set by the Admin. |
| 30 | Teams are per semester-subject. |
| 31 | Only students of sections mapped to a semester-subject can join its teams. |
| 32 | A student has at most one active team per semester-subject. |
| 33 | Team members may come from different eligible sections. |
| 34 | Every team has exactly one Team Lead plus at least one member. |
| 35 | Team size must be within the college min/max. |
| 36 | Students can form teams only when team formation is enabled. |
| 37 | Team names are set/changed by the Evaluator or Admin, not students. |
| 38 | Team locking is global per college. |
| 39 | Locked teams can be modified only by the Admin. |
| 40 | A Team Lead change before lock recalculates the default evaluator. |
| 41 | The Admin defines the mentor list per semester with per-faculty capacity. |
| 42 | Mentor selection is FCFS within capacity. |
| 43 | A faculty member at capacity is unavailable for new normal assignments. |
| 44 | Normally a team has one mentor; Admin may assign multiple with equal permissions. |
| 45 | A mentor must accept or reject a request; after rejection the team may choose again. |
| 46 | Mentor capacity enforcement is concurrency-safe and transactional. |
| 47 | Default evaluator = faculty of (subject + Team Lead's section). |
| 48 | Evaluator assignment is phase-specific; normally one evaluator per team per phase. |
| 49 | The Admin can override evaluators and allow cross-section evaluation. |
| 50 | Phases belong to a semester-subject, not to a section or faculty. |
| 51 | Phases cannot overlap within a semester-subject. |
| 52 | A phase's end date closes submissions. |
| 53 | A separate evaluation lock (manual or at evaluation end date) closes marking. |
| 54 | Admin can manually lock or unlock a phase. |
| 55 | One evaluation exists per team-phase-evaluator assignment. |
| 56 | Marks cannot exceed the phase maximum. |
| 57 | A team that never submits receives 0 marks. |
| 58 | Students cannot view marks; marks are never released to students. |
| 59 | All mark changes are audited. |
| 60 | A phase submission has one record and can contain multiple links. |
| 61 | Dynamic forms and file-upload tables are out of current scope. |
| 62 | Notifications support in-app, email and push; the sender chooses channels. |
| 63 | Notifications are sent immediately; emails go through the outbox job. |
| 64 | No soft delete is used; hard delete cascades per defined relationships. |
| 65 | A section with students cannot be deleted. |
| 66 | Deleting an actor never deletes the history they created (references set to null). |
| 67 | Only the Admin can promote students. |
| 68 | Promotion updates the existing student account and records history. |
| 69 | Required data is downloaded before promotion; marks are then deleted. |
| 70 | At semester end, team/assignment/submission/mark data is wiped; structure and phases are kept. |
| 71 | CSV imports are partial: valid rows import, invalid rows are reported with errors. |
| 72 | CSV import tracking tables are not required. |
| 73 | Reports are generated from relational data and are downloadable. |
| 74 | Dashboards are UI views without dedicated tables. |
| 75 | Audit logs record actor, role, IP, user agent, old and new values for security, workflow, evaluation, promotion, import, notification and configuration actions. |
| 76 | Scheduled jobs run via secret-protected endpoints called by UptimeRobot. |

## 28. End-to-End Workflow
```
Super Admin creates College + College Admin
→ College Admin activated (credentials emailed)
→ Admin configures college settings
→ Create semesters & subjects
→ Create semester-specific sections + assign Class Coordinators
→ Add faculty & students (activate → credentials emailed)
→ Offer subjects in semesters → map subjects to sections → assign faculty
→ Create phases per semester-subject
→ Define semester mentor list + capacities
→ Enable team formation
→ Students form teams per subject → choose mentor (accept/reject)
→ Evaluator auto-assigned
→ Global team lock
→ Phase opens → teams submit links → end date closes submissions
→ Evaluator enters marks (0 if no submission) → evaluation lock
→ Audit records created → next phase
→ Semester completion → download data
→ Student promotion (Admin) → semester-end reset → next batch
```

## 29. Data Model
PostgreSQL, auto-increment bigint primary keys (better B-tree index locality than random UUIDs), `created_at`/`updated_at` on every table. Full Phase 1 DBML: `docs/phase1-schema.dbml`.

### 29.1 Phase 1 tables
| Table | Purpose / key constraints |
|---|---|
| `colleges` | Tenants. `code` unique; status ACTIVE/INACTIVE. |
| `college_settings` | 1:1 with college. Team size, default mentor capacity, team formation flag, global team lock, cross-section evaluation. |
| `users` | All accounts. `college_id` NULL only for SUPER_ADMIN; email globally unique; role; status (default INACTIVE); name; phone; `must_change_password`; `activated_at`; `last_login_at`. Partial unique: one ADMIN per college. |
| `faculty` | Faculty profile (1:1 user, `college_id`). |
| `students` | Student profile (1:1 user, `college_id`, `roll_number` unique per college, `section_id` PROTECT). |
| `password_reset_otps` | Hashed OTP, purpose, expiry, attempts, used_at. |
| `semesters` | `semester_number` 1–12, unique per college. |
| `subjects` | `code` unique per college, name. |
| `sections` | Per semester; name unique per semester; `class_teacher_id` (SET NULL), unique per semester. |
| `semester_subjects` | Subject offered in semester; unique (semester, subject). |
| `section_subjects` | Section ↔ semester-subject + assigned `faculty_id` (nullable, SET NULL). Merged former `section_subject_faculty`. Unique (section, semester_subject). |
| `audit_logs` | college, actor (SET NULL), actor_role, action, entity, old/new JSONB, IP, user agent. |
| `email_outbox` | Queued emails: kind (ACCOUNT_ACTIVATION, PASSWORD_RESET_OTP, GENERIC), status, attempts, last error. |
| simplejwt `token_blacklist` | Refresh-token blacklist for logout. |

### 29.2 Phase 2 tables (planned)
| Table | Purpose |
|---|---|
| `phases` | Per semester-subject; dates, `evaluation_end_date`, status enum, max marks, order, `locked_at`, `locked_by`; exclusion constraint against overlap. |
| `semester_mentors` | Mentor list per semester with capacity; unique (semester, faculty). |
| `teams` | Per semester-subject; team lead; name + `team_name_set_by`; lock info. |
| `team_members` | Partial unique: one active team per student per semester-subject. |
| `mentor_assignments` | PENDING/ACCEPTED/REJECTED/REMOVED; `assigned_by` SET NULL. |
| `evaluator_assignments` | Per team per phase; AUTO / ADMIN_OVERRIDE; unique (team, phase). |
| `phase_submissions` | One per team per phase; DRAFT/SUBMITTED; `submitted_by` SET NULL. |
| `submission_links` | Many per submission; link type + URL. |
| `evaluations` | Per evaluator assignment; `submission_id` nullable; marks, max marks snapshot, remarks, status PENDING/SUBMITTED/LOCKED. |

### 29.3 Phase 3 tables (planned)
| Table | Purpose |
|---|---|
| `notifications` | Title, message, priority, attachment path, link, expiry; `created_by` SET NULL. |
| `notification_recipients` | Per user per channel; status, sent/read times. |
| `push_subscriptions` | Web Push endpoint + keys per user device. |
| `student_promotions` | From/to semester and section (SET NULL + name snapshots), promoted_by, marks_deleted, notes. |

## 30. Technology Stack & Deployment
| Layer | Choice |
|---|---|
| Backend | Python 3.11, **Django 5.2 LTS**, Django REST Framework |
| Auth | simplejwt, tokens in httpOnly Secure cookies, CSRF protection, token blacklist |
| API docs | drf-spectacular (Swagger at `/api/docs/`), all APIs under `/api/v1/` |
| Database | **PostgreSQL 18** (JSONB, exclusion constraints via `btree_gist`, partial unique indexes) |
| Other backend | django-cors-headers, psycopg 3, whitenoise |
| Frontend | React + Vite + Tailwind CSS in **JSX** (no TypeScript), shadcn/ui, lucide-react icons, lazy-loaded routes, PWA |
| Email | Gmail SMTP (dev), Brevo (prod) |
| Jobs | Secret-token HTTP endpoints called by UptimeRobot |
| Hosting | Backend on **Render**, frontend on **Vercel** |
| Local dev | No Docker; local PostgreSQL 18 service; no git yet |

### Backend app layout
```
backend/
├── config/        settings (base/dev/prod), urls, wsgi
└── apps/
    ├── common/    base models, college scoping, RBAC permissions, audit service + AuditLog,
    │              email service + EmailOutbox, password/OTP utils, job endpoints, error format, health
    ├── colleges/  colleges, college settings, College Admin management (Super Admin)
    ├── accounts/  users, auth, profile, faculty & student management
    └── academics/ semesters, subjects, sections, class coordinators, subject mappings, faculty assignment
    # Phase 2: teams/, projects/ (phases, submissions), evaluations/
    # Phase 3: notifications/, imports/, reports/, promotions/, dashboards/
```

## 31. Delivery Roadmap
### Phase 1 — Platform foundation
1. **RBAC + authentication** — roles; login/logout/refresh (cookie JWT, CSRF); forced first-login password change; forgot password via email OTP; inactive users/colleges blocked.
2. **Super Admin bootstrap** — created/ensured from env vars on every server start (idempotent, after `migrate`).
3. **Super Admin APIs** — CRUD colleges (with default settings); create/update/activate/deactivate/delete College Admin; view & manage any college.
4. **Common profile service** — `GET/PATCH /api/v1/me/`, change password.
5. **College Admin academic CRUD** — faculty, students, semesters, subjects, sections, class coordinators, semester-subject offerings, section-subject mappings, faculty assignment.
6. **College configuration** — `GET/PATCH` college settings.
7. **Audit logging** on all of the above.

### Phase 2 — Projects & teams
- Phases (dates, max marks, order, no overlap, status, evaluation lock).
- Semester mentor list + per-faculty capacity.
- Teams per semester-subject (create, invite/join, Team Lead, size rules, global lock).
- Mentor requests (FCFS, concurrency-safe accept/reject, admin reassign).
- Evaluator auto-assignment and admin override.
- Phase submissions + links.
- Evaluations and marks (0 for missing submission, lock/unlock, audit).
- Team naming by evaluator.
- Job endpoint: phase status / auto-lock.

### Phase 3 — Remaining features
- Notifications (in-app, email, push) + push subscriptions.
- Bulk CSV imports (template → validate → preview → partial import → error CSV).
- Reports & data downloads.
- Student promotion + semester-end reset.
- Dashboards (Super Admin, Admin, Faculty, Student).
- Audit log viewer APIs.

## 32. Future Expansion
- Additional departments and degree programs within a college.
- More colleges on the same platform (already supported by tenancy).
- Larger student populations.
- Optional future: rubric-based marks, file uploads, academic-year archiving.

## 33. Key Benefits
- **Platform owner:** one deployment serving many colleges; central control and support access.
- **Admin:** centralized management, bulk CSV, automated assignments, reports, full audit trail.
- **Faculty:** clear teaching/mentoring/evaluation views, less spreadsheet work.
- **Students:** fair FCFS mentor allocation, simple link submissions, clear deadlines, mobile PWA.
- **College:** standardized process, fewer data-entry errors, structured historical data.

## 34. Assumptions & Open Items
**Assumptions**
- The Super Admin creates each college together with its College Admin.
- Super Admin acting on a college uses the `X-College-Id` header; all such actions are audited with the Super Admin as actor.
- Activation credentials are emailed immediately; only failed or over-budget sends wait for the job (~5 minutes).
- If a section-subject has no faculty assigned yet, affected teams show "evaluator pending" for the Admin to resolve.
- The college PRD keeps the single-college wording; multi-college is never mentioned to clients.

**Open items**
- Exact email templates and branding per college.
- Report file formats (CSV vs. XLSX vs. PDF).
- Push notification provider details (VAPID key management).
- Data retention policy for audit logs and email outbox.
- Rate limiting values for login and OTP endpoints (draft in docs/API.md: login 5/min per IP+email, OTP 3 per 10 min per email).
