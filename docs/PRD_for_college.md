# Project Management System (PMS) — Product Requirements Document

**Group 34 — Major Project**
**Team Members:** Atharva Raj Sinha & Megha Kanyal
**Target Users:** Admin, Faculty, Students
**Initial Target:** B.Tech CSE
**Application Type:** Web Application + Progressive Web App (PWA)

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Objectives](#2-objectives)
3. [User Roles](#3-user-roles)
4. [Academic Structure](#4-academic-structure)
5. [Class Coordinator Assignment](#5-class-teacher-assignment)
6. [Account Management](#6-account-management)
7. [Authentication](#7-authentication)
8. [Admin Configuration](#8-admin-configuration)
9. [Project Phases](#9-project-phases)
10. [Team Formation](#10-team-formation)
11. [Team Locking](#11-team-locking)
12. [Mentor Selection](#12-mentor-selection)
13. [Evaluator Assignment](#13-evaluator-assignment)
14. [Phase Submission & Links](#14-phase-submission--links)
15. [Evaluation and Marks](#15-evaluation-and-marks)
16. [Notifications](#16-notifications)
17. [Email](#17-email)
18. [Push Notifications](#18-push-notifications)
19. [Semester Completion & Student Promotion](#19-semester-completion--student-promotion)
20. [Hard Delete](#20-hard-delete)
21. [Bulk CSV Operations](#21-bulk-csv-operations)
22. [Reports](#22-reports)
23. [Dashboards](#23-dashboards)
24. [Audit Logs](#24-audit-logs)
25. [User Interface](#25-user-interface)
26. [Business Rules](#26-business-rules)
27. [Complete Workflow](#27-complete-workflow)
28. [Technology Overview](#28-technology-overview)
29. [Delivery Plan](#29-delivery-plan)
30. [Future Expansion](#30-future-expansion)
31. [Key Benefits](#31-key-benefits)

---

## 1. Introduction

PMS is one central system for managing the full lifecycle of academic projects in a college. It replaces manual processes: spreadsheets, paper submissions, manual team formation, mentor allocation, evaluation tracking, marks management and report preparation.

PMS has separate interfaces and permissions for **Admin**, **Faculty** and **Students**. Faculty members work as **Mentors** and **Evaluators**; students work as **Team Leads** or **Team Members**. The system covers the whole project workflow, from academic setup and team formation through mentor assignment, phase submissions, evaluation, notifications, reporting and student promotion.

## 2. Objectives

- Centralize academic project management.
- Reduce manual administrative work.
- Automate project team formation.
- Provide fair, first-come-first-served (FCFS) mentor allocation.
- Automate evaluator assignment.
- Manage project phases and deadlines.
- Digitize project evaluation and marks management.
- Provide centralized notifications.
- Generate downloadable reports.
- Support bulk data creation through CSV.
- Keep audit records of important activities.
- Provide a responsive PWA that works on desktop and mobile.

## 3. User Roles

### 3.1 Admin

The college has exactly one Admin, who has control over the whole system. The Admin can:

- Add, update, activate, deactivate and hard delete students and faculty.
- Manage semesters and subjects.
- Create sections within each semester.
- Assign exactly one Class Coordinator to each section, and change or remove that assignment.
- Assign students to sections.
- Map subjects to the sections that take them.
- Assign one faculty member to each section-subject.
- Create and manage project phases.
- Define the mentor list for each semester, with each mentor's capacity.
- Configure team size, team formation, team locking and evaluation rules.
- Override evaluator assignments.
- Lock and unlock phases and evaluations.
- Correct marks when permitted.
- Promote students.
- Send notifications and run bulk CSV operations.
- Generate and download reports.
- View audit logs.

The Admin cannot act as an evaluator.

### 3.2 Faculty

**As a Mentor**, a faculty member can:
- Be selected as a mentor by teams (if on the semester's mentor list).
- Accept or reject mentor requests.
- View and work with their mentored teams.
- Receive team-related notifications.

**As an Evaluator**, a faculty member can:
- View their evaluation teams and each team's submission status.
- Set or change team names.
- Evaluate teams and enter marks.
- Submit evaluations.
- Send notifications to their evaluation teams.

A faculty member can be a mentor and an evaluator at the same time.

### 3.3 Student

A student can:
- Log in with email and password.
- Change their temporary password on first login.
- Create a team (becoming its Team Lead) or join another student's team, separately for each project subject.
- Select a mentor for each of their teams.
- Submit phase work as links.
- Receive in-app, email and push notifications.
- Update their own profile details (not their email).

A student:
- Belongs to one current semester.
- Belongs to one section within that semester.
- Can be in only one active team per subject.

A student's section is not subject-specific.

## 4. Academic Structure

```
Semester → Sections → Students
Semester → Subjects → Section-Subjects → Faculty
Semester-Subject → Phases
Semester-Subject → Teams
```

- A section belongs to exactly one semester.
- A subject can be offered in multiple semesters.
- A subject offered in a semester can be mapped to any subset of that semester's sections.
- Each section-subject has exactly one assigned faculty member.
- Project phases and teams belong to the **subject within the semester**, not to an individual section.
- **Every subject in PMS is a project subject.**
- **Semester records are reused every academic batch.** At the end of a semester the data is downloaded and cleared (see Section 19), and the same structure serves the next batch.

### Example — Semester 7

Sections: A, B, C, D, E, F

| Subject | Section | Faculty |
|---|---|---|
| DAA | A | Faculty X |
| DAA | C | Faculty Y |
| DAA | D | Faculty X |
| DSA | A | Faculty Y |
| DSA | B | Faculty Z |
| DSA | C | Faculty X |
| DSA | D | Faculty X |
| AI/ML | B | Faculty Y |

In this example:
- Students from sections **A, C and D** take DAA, so they form **DAA teams** among themselves.
- Students from sections **A, B, C and D** take DSA, so they form **separate DSA teams**.
- Only section **B** takes AI/ML, so AI/ML teams are formed only from Section B students.

A student in Section A belongs to Section A for the whole semester. They don't have a separate section for each subject, but they do form a separate team for each subject they take (here, one DAA team and one DSA team).

Semester 7 Section A and Semester 8 Section A are different section records. Section names are unique within a semester, not across the college.

## 5. Class Coordinator Assignment

Each section in a semester must have exactly one Class Coordinator.

- Any faculty member can be a Class Coordinator.
- The assignment is for a specific semester and section.
- A faculty member can be Class Coordinator of sections in different semesters, but of at most one section within the same semester.
- Being Class Coordinator doesn't depend on teaching any subject in that section.
- The Admin assigns and manages Class Coordinators.
- An assignment doesn't carry over to another semester, even when the section names match.
- A section can be created before its Class Coordinator is assigned, but must have one before the semester's academic workflow begins.

| Semester | Section | Class Coordinator |
|---|---|---|
| Semester 7 | A | Faculty X |
| Semester 7 | B | Faculty Y |
| Semester 7 | C | Faculty Z |
| Semester 5 | C | Faculty X |

## 6. Account Management

### 6.1 Students

The Admin creates a student account with: **Name, Email, Roll Number, Semester, Section, Phone.**

- The section must belong to the selected semester.
- Email and roll number must be unique.
- A student has only one current section at a time.

### 6.2 Faculty

The Admin creates a faculty account with: **Name, Email, Phone.**

- Faculty email must be unique.

### 6.3 Activation

- **New accounts start as Inactive.**
- When the Admin activates an account, the system generates a random temporary password and emails it to the user, with their login email.
- The user logs in and **must change the temporary password** before using the system.
- The Admin can deactivate an account at any time. Deactivated users cannot log in.

### 6.4 Profile

All users can view and update their own profile details (name, phone) and change their password. **The registered email address can't be changed.**

## 7. Authentication

- Email and password login.
- Temporary passwords, with a required password change on first login.
- Forgotten passwords are recovered with a one-time code (OTP) sent by email, followed by a password reset.
- Account activation and deactivation.
- Role-based access: each user sees and can do only what their role allows.
- Secure sessions, with automatic sign-out after inactivity or on logout.

## 8. Admin Configuration

The Admin controls these system-wide settings:

| Setting | Description |
|---|---|
| Minimum team size | The smallest allowed team (at least 2: Team Lead + one member) |
| Maximum team size | The largest allowed team |
| Default mentor capacity | How many teams a mentor can take by default |
| Team formation | On/off. Students can create and join teams only while it is on. |
| Team lock | Locks all teams at once (see Section 11) |
| Cross-section evaluation | Whether evaluators may evaluate teams outside their own sections |

## 9. Project Phases

Each semester-subject can have multiple phases. A phase contains:

- Phase name
- Short description
- Detailed description
- Start date
- End date (submission deadline)
- Evaluation end date (optional)
- Maximum marks
- Display order
- Status and lock information

**Example:** Phase 1 — Project Proposal, 01/09/2026 – 15/09/2026, maximum marks 20.

### Phase Status

| Status | Meaning |
|---|---|
| **Upcoming** | The start date hasn't arrived. Teams can't submit yet. |
| **Open** | Between the start and end date. Teams can submit and update their links. |
| **Closed** | Past the end date. Submissions are closed, and evaluators enter marks. |
| **Locked** | Evaluation is locked, so marks can no longer be changed. |

### Phase Rules

- Phases belong to a semester-subject and are shared by all sections mapped to it.
- Phases can't overlap within the same semester-subject.
- The Admin can create, edit, reorder and delete phases.
- **Submissions close automatically at the phase end date.**
- **Evaluation is locked manually by the Admin, or automatically at the evaluation end date if one is set.**
- The Admin can unlock a locked phase to make corrections.
- Deleting a phase permanently removes its associated data.

## 10. Team Formation

Teams are formed **per subject within a semester**.

- Students can create or join teams only while the Admin has team formation switched on.
- A team belongs to one semester-subject (e.g. Semester 7 DAA).
- All team members must be students from sections mapped to that subject in that semester.
- Team members can come from different eligible sections; formation isn't bound to a section.
- A student can be in only **one active team per subject**, and so can be in several teams in a semester, one for each subject they take.
- Every team has exactly one Team Lead.
- A Team Lead plus at least one other member is required.
- Team size must stay within the Admin-configured minimum and maximum.
- **Team names are set or changed by the evaluator (or Admin), not by students.**

## 11. Team Locking

Team locking applies to all teams at once.

After teams are locked:
- Members can't be added or removed.
- The Team Lead can't be changed.
- Evaluator changes that would normally follow a team change can't happen.

Only the Admin can modify a locked team.

Before the lock, changing the Team Lead can change the team's automatically assigned evaluator (see Section 13).

## 12. Mentor Selection

- **For each semester, the Admin defines the list of faculty available as mentors, with each mentor's capacity** (the maximum number of teams they can mentor).
- Teams choose a mentor from that list on a **first-come-first-served** basis.
- A mentor who reaches capacity (e.g. 5/5 teams) is shown as unavailable for new requests.
- The mentor accepts or rejects each request. If rejected, the team can pick another available mentor.
- The Admin can reassign mentors.
- Normally each team has exactly one mentor. In special cases the Admin can assign multiple mentors, each with the same permissions.
- Capacity is enforced reliably, so two teams can't take a mentor's last slot at the same moment.

## 13. Evaluator Assignment

The default evaluator is determined automatically:

```
Semester → Subject → Team Lead's Section → Faculty teaching that subject in that section
```

**Example:** Semester 7, DAA, Team Lead in Section A, and DAA + Section A is taught by Faculty X, so the **default evaluator is Faculty X.**

- If the Team Lead changes (before the team lock) to a Section C student, the evaluator is recalculated from DAA + Section C.
- Evaluator assignment is phase-specific, normally with one evaluator per team per phase.
- The Admin can manually override the evaluator.
- The Admin can allow evaluators to evaluate teams outside their own sections.

## 14. Phase Submission & Links

Teams submit their work for each phase as links.

- Each team has **one submission record per phase**.
- A submission can contain **multiple links**, each with a link type and URL. Examples:
  - Repository (GitHub)
  - Documentation
  - Demo URL
  - Presentation
  - Google Drive
  - Google Form
- Teams can update their submission while the phase is **Open**.
- Dynamic forms and file uploads are not in the current scope.

## 15. Evaluation and Marks

- One evaluator per team per phase evaluates the team against the phase's maximum marks.
- Marks can't exceed the phase maximum.
- **A team that submits nothing for a phase gets 0 marks for it.**
- Evaluators can enter and edit marks while the phase is **Closed**. Once evaluation is **Locked**, they can't change marks.
- The Admin can unlock a phase to make corrections.
- Every change to marks is recorded in the audit history.
- **Students can't see their marks.** Marks are not released to students.

## 16. Notifications

PMS has three notification channels: **in-app**, **email** and **push**. The sender chooses the channels for each notification.

| Sender | Can notify |
|---|---|
| Faculty | Their evaluation teams, Admin |
| Admin | All faculty, all students, selected semesters, selected sections, specific groups |

Notifications are sent immediately and can include a title, message, attachment, link, priority and expiry date.

## 17. Email

Email is used for:
- Account activation and temporary passwords
- Password-reset one-time codes (OTPs)
- Notifications
- Phase deadline reminders
- Evaluation updates

## 18. Push Notifications

The PWA supports native push notifications on supported devices. Delivery depends on the channels the sender chose and on whether notifications are allowed on the user's device.

## 19. Semester Completion & Student Promotion

### Semester Completion

At the end of a semester:
1. The Admin downloads all the semester's data and reports.
2. The semester's project data (teams, mentor and evaluator assignments, submissions and marks) is cleared.
3. The academic structure is kept (semesters, sections, subjects, subject mappings and phases), ready for the next batch. Phase dates are updated for the new batch.

### Student Promotion

**Only the Admin can promote students**, either individually or a whole section at once.

1. The required semester data is downloaded.
2. The Admin confirms the promotion.
3. The existing student account is updated, not re-created.
4. The student's new semester and section are assigned.
5. The previous semester and section are saved in the promotion history.
6. Existing marks are deleted, after the data has been downloaded.

## 20. Hard Delete

PMS doesn't use soft deletion. A delete permanently removes the record and its dependent records, which can include:

- Team memberships
- Submissions and links
- Evaluations and marks
- Mentor assignments
- Evaluator assignments
- Other dependent project records

Some deletes are blocked to protect data. For example, a section that still has students can't be deleted until they are moved or removed.

## 21. Bulk CSV Operations

Creation and addition operations can be done in bulk by CSV for:

- Students
- Faculty
- Semesters
- Subjects
- Sections
- Section-subject mappings
- Faculty assignments
- Class Coordinator assignments

**Workflow:**
```
Download Template → Prepare CSV → Upload → Validate → Preview → Import → Results
```

The system provides:
- Validation of each row
- Duplicate detection
- Success and failure counts
- Row-level error messages
- A downloadable CSV of the failed rows

**Valid rows are imported even if other rows fail.** The failed rows are reported so they can be fixed and uploaded again.

- Student rows include the student's semester and section.
- Sections are created within a specific semester.
- Faculty assignments are made per section + subject.
- Class Coordinator rows give a semester, a section and a faculty member. The import checks that the section belongs to that semester and that the faculty member exists.

## 22. Reports

All reports are downloadable.

- **Students:** student lists, semester breakdowns, section breakdowns, promotion data
- **Faculty:** faculty lists, teaching assignments, Class Coordinator assignments, mentoring assignments, evaluation assignments
- **Teams:** team lists, members, Team Leads, members' sections, mentors, evaluators
- **Phases & Evaluation:** phase status, pending evaluations, evaluator marks, audit information
- **Bulk Imports:** import summaries, failed records, validation errors

## 23. Dashboards

**Admin Dashboard:** total students, total faculty, semesters, subjects, sections, Class Coordinator assignments, active teams, mentors, phase statuses, pending evaluations, recent audit activity.

**Faculty Dashboard:** Class Coordinator sections, teaching sections and section-subjects, mentoring teams, evaluation teams, submission counts, pending evaluations.

**Student Dashboard:** current semester and section, teams (one per subject), mentor, phase deadlines, submission status.

## 24. Audit Logs

The system records important actions, each with:

- Actor
- Role
- Action
- Entity type and ID
- Previous value
- New value
- Timestamp
- Source (IP address and device)

Activities recorded include:
- User operations
- Hard deletes
- Team locking
- Mentor changes
- Evaluator changes
- Phase lock/unlock
- Marks entry and edits
- Student promotion
- CSV imports
- Notifications
- Configuration changes

## 25. User Interface

- Fully responsive on mobile, tablet and desktop, and installable as a PWA.
- Clean, simple and lightweight design.
- **Theme:** orange with white (light mode) and orange with black (dark mode), following the user's device setting, with a manual switch.
- Consistent icons and typography throughout.
- A common footer on every page: **"© {current year} PMS. All rights are reserved."**

## 26. Business Rules

| No. | Business Rule |
|---|---|
| 1 | There is exactly one Admin. |
| 2 | The Admin cannot act as an evaluator. |
| 3 | User email addresses are unique and cannot be changed. |
| 4 | Student roll numbers are unique. |
| 5 | New accounts are inactive until activated by the Admin. |
| 6 | Activation emails a temporary password, which must be changed at first login. |
| 7 | A student has one current semester at a time. |
| 8 | A student belongs to exactly one section within their current semester. |
| 9 | A section belongs to exactly one semester. |
| 10 | Section names are unique within a semester. |
| 11 | Sections are not subject-specific; a student does not have different sections for different subjects. |
| 12 | Semester 7 Section A and Semester 8 Section A are different section records. |
| 13 | All subjects are project subjects. |
| 14 | A subject can be offered in multiple semesters. |
| 15 | A subject in a semester can be mapped to any subset of that semester's sections. |
| 16 | Each section-subject has exactly one assigned faculty member. |
| 17 | The same subject can have different faculty in different sections. |
| 18 | A faculty member can teach multiple section-subject combinations. |
| 19 | Semester records are reused for each new batch. |
| 20 | Teams belong to a semester-subject. |
| 21 | Team members must be from sections mapped to the team's subject in that semester. |
| 22 | Team members do not need to be from the same section. |
| 23 | A student can be in only one active team per subject. |
| 24 | Every team has exactly one Team Lead. |
| 25 | A Team Lead plus at least one additional member is compulsory. |
| 26 | Team size must be within the Admin-configured minimum and maximum. |
| 27 | Students can form teams only while team formation is enabled. |
| 28 | Team names are set or changed by the evaluator or Admin, not by students. |
| 29 | Team locking applies to all teams at once. |
| 30 | Locked teams cannot be modified by students or faculty; only the Admin can modify them. |
| 31 | A Team Lead change before the lock may change the automatically assigned evaluator. |
| 32 | The Admin defines the mentor list for each semester. |
| 33 | Mentor capacity is set by the Admin. |
| 34 | Mentor selection is first-come-first-served within capacity. |
| 35 | A mentor at capacity is unavailable for new requests. |
| 36 | A mentor must accept or reject each request; after a rejection the team may choose another mentor. |
| 37 | Normally a team has one mentor; the Admin may assign more in special cases, with equal permissions. |
| 38 | Mentor capacity is enforced reliably, even when requests arrive at the same moment. |
| 39 | The default evaluator is the faculty teaching the subject in the Team Lead's section. |
| 40 | Evaluator assignment is phase-specific, normally one evaluator per team per phase. |
| 41 | The Admin can override the evaluator. |
| 42 | The Admin may allow evaluation outside an evaluator's own sections. |
| 43 | Phases belong to a semester-subject, not to a section or faculty member. |
| 44 | Phases cannot overlap within the same semester-subject. |
| 45 | Submissions close automatically at the phase end date. |
| 46 | Evaluation is locked by the Admin or automatically at the evaluation end date. |
| 47 | The Admin can lock and unlock phases. |
| 48 | A locked evaluation prevents evaluator mark changes. |
| 49 | One evaluation exists per team, per phase. |
| 50 | Marks cannot exceed the phase maximum. |
| 51 | A team with no submission receives 0 marks for that phase. |
| 52 | Students cannot view marks; marks are not released to students. |
| 53 | Marks changes are recorded in audit history. |
| 54 | A phase submission has one record per team and can contain multiple links. |
| 55 | Dynamic forms and file uploads are not in the current scope. |
| 56 | Notifications support in-app, email and push channels, chosen by the sender. |
| 57 | Notifications are sent immediately. |
| 58 | No soft delete is used; deletion removes dependent data. |
| 59 | Only the Admin can promote students. |
| 60 | Promotion updates the existing student account. |
| 61 | Semester data is downloaded before promotion is confirmed. |
| 62 | Marks are deleted during promotion, after data download. |
| 63 | Promotion history records the previous semester and section. |
| 64 | Creation and addition operations support bulk CSV upload. |
| 65 | CSV imports validate rows, import valid rows and report failed rows. |
| 66 | Reports are downloadable. |
| 67 | Audit logs record security, workflow, evaluation, promotion, import, notification and configuration actions. |
| 68 | Every section must have exactly one Class Coordinator before the academic workflow begins. |
| 69 | A Class Coordinator can be any faculty member and need not teach in that section. |
| 70 | A faculty member may be Class Coordinator of sections in different semesters, but of at most one section per semester. |
| 71 | A Class Coordinator assignment does not carry over to another semester. |

## 27. Complete Workflow

```
Admin Setup
→ Create Semesters & Subjects
→ Create Sections within Semesters & assign Class Coordinators
→ Add Faculty and Students (individually or via CSV) & activate accounts
→ Map Subjects to Sections & assign Faculty to each Section-Subject
→ Configure Team Sizes, Mentor List & Capacities
→ Create Project Phases
→ Enable Team Formation
→ Students form Teams per Subject
→ Teams select Mentors (Accept / Reject)
→ Evaluators assigned automatically
→ Teams Locked
→ Phase Opens → Teams submit Links
→ Deadline → Submissions Close
→ Evaluators enter Marks (0 if not submitted) & set Team Names
→ Evaluation Locked → Audit Recorded
→ Next Phase …
→ Semester Completion → Download Data
→ Student Promotion → Semester data cleared for next batch
```

## 28. Technology Overview

| Layer | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS, shadcn/ui, Progressive Web App |
| Backend | Django, Django REST Framework |
| Database | PostgreSQL |
| Email | SMTP email service |

PostgreSQL provides relational integrity, transactional workflows, uniqueness constraints and structured audit data.

## 29. Delivery Plan

**Phase 1 — Foundation**
- Login, role-based access, first-login password change, OTP password recovery
- Profile management for all users
- Faculty and student account management with activation
- Academic setup: semesters, subjects, sections, Class Coordinators, subject-section mapping, faculty assignment
- Admin configuration (team size, mentor capacity, team formation, team lock, cross-section evaluation)
- Activity audit logging

**Phase 2 — Projects, Teams & Evaluation**
- Project phases and phase status
- Mentor list, mentor requests and FCFS allocation
- Team formation per subject and team locking
- Automatic evaluator assignment and Admin override
- Link-based submissions
- Evaluation, marks and locking

**Phase 3 — Communication, Data & Insights**
- In-app, email and push notifications
- Bulk CSV imports
- Reports and data downloads
- Semester completion and student promotion
- Dashboards and audit log viewer

## 30. Future Expansion

Initially built for B.Tech CSE, PMS is structured to support:
- Other academic departments
- Additional degree programs
- Larger student populations

Because sections belong to their semesters, section names don't need to be unique across the college.

## 31. Key Benefits

**For Admin:** centralized management, bulk CSV workflows, automated assignments, downloadable reports, full auditability.

**For Faculty:** clear views of teaching sections, streamlined mentoring and evaluation, less manual spreadsheet tracking.

**For Students:** fair FCFS mentor allocation, simple link-based submissions, clear phase deadlines, mobile PWA access.

**For the College:** standardized project management, fewer manual data-entry errors, secure archive of historical project data, and a structured semester, section, subject, faculty and project setup.
