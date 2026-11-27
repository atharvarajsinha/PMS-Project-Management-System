# PMS — Features by User Role

What each kind of user can do in PMS today (Phase 1 + Phase 2), from the smallest convenience to the biggest
workflow. Items marked **(Phase 3)** are planned but not built yet.

Roles: **Super Admin** (runs the platform) → **College Admin** (runs one college) → **Faculty** (teacher, class
teacher, mentor, evaluator) → **Student**.

Contents
1. [Features every user gets](#1-features-every-user-gets)
2. [Super Admin](#2-super-admin)
3. [College Admin](#3-college-admin)
4. [Faculty](#4-faculty)
5. [Student](#5-student)
6. [Automatic system behaviour](#6-automatic-system-behaviour)
7. [Planned for Phase 3](#7-planned-for-phase-3)

---

## 1. Features every user gets

1. **Sign in with email and password.** One login page for everyone. Accounts stay signed in with secure
   cookies and are refreshed silently; signing out ends the session everywhere it was used.
2. **First-login password change.** Accounts start with a temporary password sent by email; the user must set
   their own before using anything else.
3. **Forgot password.** Enter your email → receive a one-time code (OTP) by email → enter it → set a new
   password. Codes expire after 10 minutes and allow a limited number of attempts.
4. **Profile.** View your details; edit your name and phone. Email can't be changed. Change your password at any
   time.
5. **Protection against guessing.** Repeated wrong logins or OTP requests are slowed down (rate limits).
6. **Blocked accounts.** Inactive accounts, and everyone in a deactivated college, can't sign in and see a clear
   message why.
7. **Auto-refresh.** Every page reloads its data every 10 seconds while the tab is visible; the refresh button in
   the top bar reloads immediately.
8. **Works on phones.** Tables turn into cards on small screens; forms open as bottom sheets; bottom navigation
   on mobile.
9. **Installable app (PWA).** Can be installed to the home screen; shows an offline banner when the connection
   drops and offers an update when a new version is available.
10. **Light and dark theme.** Toggle in the top bar.
11. **Search, filters, sorting and pages** on every list; filters are kept in the address bar, so a filtered view
    can be bookmarked or shared.
12. **Confirmations for destructive actions.** Hard deletes ask you to type the name/code before they run.

---

## 2. Super Admin

The platform owner. There is exactly one, created automatically from server settings.

1. **Automatic account.** Created (or re-activated) from the `SUPER_ADMIN_EMAIL / PASSWORD / NAME` settings every
   time the server starts; can also be run by hand with `ensure_superadmin`.
2. **Create a college.** Information: **name**, **code** (unique, e.g. `GEHU-BTL`), contact email, contact phone,
   address. Its settings are created with defaults (team size 2–4, mentor capacity 5, formation off, no lock).
3. **Manage colleges.** List, search and view every college with its admin and headline counts (faculty,
   students, semesters); edit details.
4. **Activate / deactivate a college.** A deactivated college's users (admin, faculty, students) can't sign in;
   reactivating restores access with nothing lost.
5. **Delete a college.** Removes the college and all its data permanently; you must type the college code to
   confirm.
6. **Create the College Admin.** One admin per college. Information: **name**, **email**, phone. The account is
   created inactive.
7. **Manage the College Admin.** Edit name/phone, **activate** (emails a temporary password), deactivate,
   **resend credentials** (emails a new temporary password), or delete the admin.
8. **Manage any college as its Admin.** Pick a college in the **college switcher** in the top bar to get the full
   College Admin menu for it (section 3). Every action is recorded with the Super Admin as the actor.
9. **Super Admin dashboard.** Number of colleges, active/inactive colleges and the colleges list.
   *(Platform-wide totals and activity: Phase 3.)*
10. **API documentation.** Swagger at `/api/docs/` (Super Admin and College Admins only, unless made public).

---

## 3. College Admin

Runs one college. (The Super Admin can do all of this too, through the college switcher.)

### 3.1 Dashboard
1. **Counts:** faculty, students, semesters, subjects, sections, subject offerings, section-subject mappings.
2. **To-do list:** inactive faculty, inactive students, sections without a class coordinator, section-subjects without
   faculty — each links to the filtered list.
3. **Per-semester breakdown:** sections, subjects and students in each semester.
4. **Team status:** whether team formation is open and whether teams are locked.

### 3.2 Faculty
1. **Add faculty.** Information: **name**, **email**, phone. Created inactive.
2. **Edit** name and phone (email is fixed).
3. **Activate** (emails a temporary password), **deactivate**, **resend credentials**.
4. **Bulk activate / bulk deactivate** selected faculty.
5. **Delete** (hard delete) one or many. Their class-teacher and teaching assignments become empty; history they
   created is kept.
6. **Faculty detail:** account status, last login, class-teacher sections and teaching assignments.
7. **Filter** by status; search by name or email.

### 3.3 Students
1. **Add a student.** Information: **name**, **email**, **roll number** (unique in the college), **semester**,
   **section** (must belong to that semester), phone. Created inactive.
2. **Edit** details and **move** a student to another section. Blocked if they are in a team for a subject the new
   section doesn't take.
3. **Activate / deactivate / resend credentials**, one at a time.
4. **Bulk activate / deactivate** — by selected students, by a whole **section**, or a whole **semester**.
5. **Delete** one or many. A student who leads a team can't be deleted until another member becomes Team Lead.
6. **Filter** by semester, section and status; search by name, email or roll number.

### 3.4 Academic structure
1. **Semesters.** Create semesters 1–12 (each number once; reused by every batch). See section, subject and
   student counts. Delete (blocked while students are in its sections).
2. **Subjects.** College-wide catalogue: **code** (unique) and **name**. Filter by semester.
3. **Sections.** Per semester (e.g. Sem 7 A, B, C): **semester** + **name** (unique within the semester).
   Delete blocked while the section has students.
4. **Class coordinators.** Assign or remove one class coordinator per section; a faculty member can be class coordinator of
   only one section per semester.
5. **Subject offerings.** Choose which subjects run in which semester.
6. **Subject mapping grid.** For a semester: subjects × sections; map a subject to a section, pick the teaching
   faculty in each cell, "map to all sections", add a subject to the semester. Plus an **All mappings** list with
   search and filters (unassigned only, by faculty, by section…).
7. **Changing a section's teaching faculty** automatically updates the default evaluator of teams led from that
   section.

### 3.5 Bulk operations
1. **CSV import** (Import Data page, or "Import CSV" on each list page) for: **faculty, semesters, subjects,
   sections (with class coordinators), students, subject mappings (with teaching faculty), mentors**.
   - Download a **template** with the right columns and example rows.
   - Upload → **preview** (a dry run that shows exactly what will happen: new / updated / skipped / error per
     row, with the reason).
   - **Import**: valid rows are saved, invalid rows are skipped.
   - Download an **error-rows CSV** to fix and re-upload.
   - Excel CSVs (UTF-8 or Windows encoding) are accepted; extra columns are ignored.
2. **Bulk delete** on every list (faculty, students, semesters, subjects, sections, offerings, mappings, phases,
   mentors, teams). Rows that can't be deleted are skipped and the reason is shown.
3. **Bulk activate / deactivate** of faculty and students (above).

### 3.6 College settings
1. **Team size:** minimum (≥ 2) and maximum members.
2. **Default mentor capacity** used when adding mentors.
3. **Team formation open** (one switch) — while on, students create, join and leave teams. Turning it off
   locks every team (whole college): students can no longer change teams, Team Lead changes stop moving
   evaluators, and only the Admin can change teams. Turning it on again unlocks them.
4. The Admin can set any active faculty member as a team's evaluator (no cross-section restriction).

### 3.7 Phases (per subject offering)
1. **Create a phase.** Information: **subject**, **name** (unique per subject), short description, details,
   **start date**, **end date** (submissions open on both days), optional **evaluation end date**, **maximum
   marks**.
2. **No overlaps.** Two phases of the same subject can't share any day (checked on screen and by the database).
3. **Status shown automatically:** Upcoming → Open (submissions) → Closed (marking) → Locked.
4. **Reorder** phases (move up/down).
5. **Edit** (not while locked). Max marks can't go below marks already given.
6. **Lock evaluation** (after the end date) — no more mark changes. **Unlock for corrections**; once unlocked by
   hand it won't auto-lock again.
7. **Progress per phase:** teams, submitted, evaluated, teams without an evaluator.
8. **Delete** one or many — also removes their submissions, evaluator assignments and marks.
9. New phases automatically get an evaluator for every existing team.

### 3.8 Mentors
1. **Mentor list per semester.** Add one or many faculty with a **capacity** (teams they may mentor that semester;
   defaults to the setting).
2. **Mentors CSV import** — `semester, faculty_email, capacity` per row; fill many semesters in one file; a row for
   someone already listed updates their capacity.
3. **See each mentor's load:** accepted teams / capacity, requests awaiting their reply, "Full" badge.
4. **Change capacity** (not below accepted teams). Lowering it to exactly the load closes their waiting list
   (other requests are auto-rejected).
5. **Remove** from the list (blocked while they have teams or pending requests); bulk remove.

### 3.9 Teams
1. **See all teams** with subject, Team Lead (and section), size (flags teams below the minimum), mentor and
   evaluator.
2. **Filters:** semester, subject, below minimum size, no mentor yet, mentor request pending, evaluator pending;
   search by team name, student name or roll number.
3. **Students without a team** tab — per subject, everyone eligible who hasn't joined a team.
4. **Create a team** for any eligible students (first chosen = Team Lead); students already picked disappear from
   the list.
5. **Team detail panel:** rename; add a student; remove a member; make someone Team Lead; assign/replace/remove a
   mentor (optionally over capacity, or several mentors in special cases); set the evaluator for each phase or
   reset it to automatic.
6. **Works on locked teams** — only the Admin can change a team after the lock.
7. **Delete** one or many teams — removes members, invites, mentor requests, submissions and links, evaluator
   assignments, evaluations and marks.

### 3.10 Evaluations
1. **Every team × phase** in one list: evaluator (and whether you overrode it), submission status, marks
   (single mark, or range and average when students got different marks).
2. **Filters:** semester, subject, phase, evaluated / not evaluated / evaluator pending; search.
3. **Correct marks** that an evaluator already entered, per student, while the phase is closed and unlocked.
   The Admin never enters marks first.

### 3.11 Audit trail
Every change (accounts, structure, settings, imports, teams, mentors, evaluators, phase locks, marks) is recorded
with who, their role, when, IP address, browser, and old/new values. *(Viewer page: Phase 3.)*

---

## 4. Faculty

A faculty member can be any combination of: teacher of section-subjects, class coordinator, mentor and evaluator.

### 4.1 Dashboard
1. Counts and lists of **class-teacher sections** (with inactive students) and **teaching assignments**.
2. College team rules (team size, whether formation is open/locked).

### 4.2 My Classes (class coordinator)
1. **Section students.** Add students to their own section (section is fixed), edit details, activate /
   deactivate (single or bulk), resend credentials. Can't delete students or move them to another section.
2. **Students' teams** (per section) — for every student × subject: their **team**, whether they are **Team
   Lead**, team size (flags too-small teams), **mentor** (and if pending), and **who evaluates them** in each
   phase. Summary per subject (in a team / without a team) and filters (subject, with/without team, search).
3. **Student details & marks** (modal from "Details & marks") — for one student, every subject: team, role,
   mentor, and for each phase the submission and evaluation windows with their progress, **who evaluated them**,
   **their marks** (draft marks flagged) and remarks, plus a running **total** per subject.

### 4.3 Teaching
1. Read-only list of the section-subjects they teach, with the students of each.

### 4.4 Mentoring
1. **Requests.** Teams that chose them, with members and evaluator. **Accept** or **reject** (optional note).
   Accepting the last free slot automatically declines the other waiting teams.
2. **My teams.** Teams they mentor, with members and each phase's status and **submitted links**. (Mentors don't
   see marks.)
3. **History.** Every request answered or ended — accepted, rejected (marked "automatic" when they were full),
   cancelled by the team, removed by the Admin — with dates and notes.

### 4.5 Evaluations (evaluator)
1. **Phase picker** with progress (evaluated / teams) for every phase they evaluate.
2. **Team list** for the phase with members, submission status and links.
3. **Enter marks per student.** One **"marks for everyone"** box fills all members; any student's mark can then be
   changed. Each mark 0–max; a team that submitted nothing gets 0 for everyone. **Save draft** or **Submit**;
   editable until the phase is locked. Marks inputs are masked like passwords (eye icon to reveal).
4. **Remarks** for the team (not shown to students).
5. **Name the team** (names unique within a subject).
6. Marks can be entered only after the phase's end date and before it is locked.

---

## 5. Student

### 5.1 Dashboard
1. Semester and section, number of project subjects, teams joined, pending invites.
2. **Phase deadlines** — open and upcoming phases with closing dates and whether the team has submitted.
3. College team rules (size, formation open/closed/locked).

### 5.2 My Projects (one card per subject the student's section takes)
1. **Create a team** (you become **Team Lead**) — while team formation is open and teams aren't locked.
2. **Invites.** Join or decline invites from other teams; joining one cancels your other invites for that
   subject. One team per subject, but you can be in different teams for different subjects.
3. **Team Lead tools:**
   - **Invite classmates** (only students who take the subject and have no team for it).
   - Cancel a pending invite; remove a member; make another member Team Lead; disband the team (before anything
     is submitted).
   - **Invite history** — every invite and whether it was accepted, declined or cancelled (incl. "joined
     another team").
   - **Choose a mentor** from the semester's mentor list (shown only as Available / Full) once the team has the
     minimum size; cancel the request; **request history** with each mentor's answer.
4. **Members** can see the team, its mentor and evaluator, and **leave** the team (while formation is open).
5. **Phases.** Each phase with max marks, description and status, and two lines:
   - **Submission:** start date – end date · **Pending / Submitted**
   - **Evaluation:** day after the submission end – evaluation end date (or "until locked") · **Pending /
     Completed** (completed once the evaluator submits marks; the marks themselves stay hidden)
6. **Submit work as links** (repository, documentation, demo, presentation, Google Drive/Form, video, other) with
   optional titles and notes; **save draft** or **submit**; edit until the end date. Any member can submit for
   the team.
7. **Students never see marks** — not in any page or API response (only whether evaluation is completed).

---

## 6. Automatic system behaviour

1. **Evaluator assignment.** Each team gets, for every phase, the faculty who teaches the subject in the Team
   Lead's section; it follows Team Lead changes (until teams are locked) and faculty re-assignments; flagged
   "evaluator pending" when that section-subject has no faculty yet. Never changes an Admin override, a locked
   phase, or marks already submitted.
2. **Phase status** follows the calendar (college time zone); submissions close after the end date even if the
   background job is late.
3. **Auto-lock** a phase after its evaluation end date (job runs about every 5 minutes).
4. **Mentor capacity.** Only accepted teams use a slot; when a mentor fills up, their waiting requests are
   rejected automatically.
5. **Invites.** Joining a team cancels the student's other invites for that subject.
6. **Emails.** Credentials and password-reset emails are sent in the background right after the action; failed
   sends are retried by the job. Temporary passwords are generated at send time and never stored in plain text.
7. **Data safety rules** enforced by the database: no overlapping phases; one team per student per subject; one
   evaluator per team per phase; one class-teacher section per faculty per semester; a section with students
   can't be deleted, nor can a student who leads a team; deleting someone never deletes the history they created.

---

## 7. Planned for Phase 3

| Who | Feature |
|---|---|
| All | **Notifications** — in-app, email and push (invites, mentor decisions, deadlines, announcements) |
| Admin | **Send notifications** to all faculty, all students, semesters, sections or groups |
| Faculty | **Notify** their evaluation teams and the Admin |
| Admin | **Reports & downloads** — students, faculty, teams, phases, evaluations, imports |
| Admin | **Student promotion** to the next semester (with history) and **semester-end reset** |
| Super Admin / Admin | **Audit log viewer** |
| All | **Fuller dashboards** — Super Admin totals; Admin/Faculty with teams, phases and evaluations |
| Platform | **Deployment** — Render, Vercel, Brevo email, UptimeRobot job |
