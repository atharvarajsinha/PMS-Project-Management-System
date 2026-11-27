import {
  BookOpen,
  Building2,
  CalendarClock,
  CalendarRange,
  FileDown,
  ClipboardCheck,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Settings,
  ShieldCheck,
  Upload,
  UserCheck,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { Role } from "@/config/choices";

// Each item may carry `load`, the page's dynamic import, so nav links can prefetch on hover.
const pages = {
  saDashboard: () => import("@/features/dashboard/pages/SuperAdminDashboard"),
  colleges: () => import("@/features/colleges/pages/CollegesPage"),
  collegeAdmins: () => import("@/features/college-admins/pages/CollegeAdminsPage"),
  adminDashboard: () => import("@/features/dashboard/pages/AdminDashboard"),
  faculty: () => import("@/features/faculty/pages/FacultyPage"),
  students: () => import("@/features/students/pages/StudentsPage"),
  semesters: () => import("@/features/semesters/pages/SemestersPage"),
  subjects: () => import("@/features/subjects/pages/SubjectsPage"),
  sections: () => import("@/features/sections/pages/SectionsPage"),
  mapping: () => import("@/features/mapping/pages/MappingPage"),
  settings: () => import("@/features/settings/pages/SettingsPage"),
  imports: () => import("@/features/imports/pages/ImportPage"),
  reports: () => import("@/features/reports/pages/ReportsPage"),
  facultyDashboard: () => import("@/features/dashboard/pages/FacultyDashboard"),
  studentDashboard: () => import("@/features/dashboard/pages/StudentDashboard"),
  myClasses: () => import("@/features/faculty-portal/pages/ClassesPage"),
  classSection: () => import("@/features/faculty-portal/pages/ClassSectionPage"),
  teaching: () => import("@/features/faculty-portal/pages/TeachingPage"),
  teachingDetail: () => import("@/features/faculty-portal/pages/TeachingDetailPage"),
  profile: () => import("@/features/profile/pages/ProfilePage"),
  // Phase 2: projects & teams
  phases: () => import("@/features/phases/pages/PhasesPage"),
  mentors: () => import("@/features/mentors/pages/MentorsPage"),
  teams: () => import("@/features/teams/pages/TeamsPage"),
  evaluations: () => import("@/features/evaluations/pages/EvaluationsPage"),
  mentoring: () => import("@/features/mentoring/pages/MentoringPage"),
  myEvaluations: () => import("@/features/evaluations/pages/MyEvaluationsPage"),
  classSectionTeams: () => import("@/features/mentoring/pages/ClassSectionTeamsPage"),
  myProjects: () => import("@/features/projects/pages/MyProjectsPage"),
};

export { pages };

const profile = { label: "Profile", to: "/profile", icon: UserRound, load: pages.profile };

export const facultyNav = [
  { label: "Dashboard", to: "/faculty", icon: LayoutDashboard, load: pages.facultyDashboard, end: true },
  { label: "My Classes", short: "Classes", to: "/faculty/classes", icon: LayoutGrid, load: pages.myClasses },
  { label: "Teaching", to: "/faculty/teaching", icon: BookOpen, load: pages.teaching },
  { label: "Mentoring", to: "/faculty/mentoring", icon: UserCheck, load: pages.mentoring },
  { label: "Evaluations", to: "/faculty/evaluations", icon: ClipboardCheck, load: pages.myEvaluations },
];

export const collegeAdminNav = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard, load: pages.adminDashboard, end: true },
  { label: "Faculty", to: "/admin/faculty", icon: GraduationCap, load: pages.faculty },
  { label: "Students", to: "/admin/students", icon: Users, load: pages.students },
  { label: "Semesters", to: "/admin/semesters", icon: CalendarRange, load: pages.semesters },
  { label: "Subjects", to: "/admin/subjects", icon: BookOpen, load: pages.subjects },
  { label: "Sections & CCs", short: "Sections", to: "/admin/sections", icon: LayoutGrid, load: pages.sections },
  { label: "Subject Mapping", short: "Mapping", to: "/admin/mapping", icon: Network, load: pages.mapping },
  { label: "Phases", to: "/admin/phases", icon: CalendarClock, load: pages.phases },
  { label: "Mentors", to: "/admin/mentors", icon: UserCheck, load: pages.mentors },
  { label: "Teams", to: "/admin/teams", icon: UsersRound, load: pages.teams },
  { label: "Evaluations", to: "/admin/evaluations", icon: ClipboardCheck, load: pages.evaluations },
  { label: "Import Data", short: "Import", to: "/admin/import", icon: Upload, load: pages.imports },
  { label: "Reports", to: "/admin/reports", icon: FileDown, load: pages.reports },
  { label: "Settings", to: "/admin/settings", icon: Settings, load: pages.settings },
];

export const superAdminNav = [
  { label: "Dashboard", to: "/sa", icon: LayoutDashboard, load: pages.saDashboard, end: true },
  { label: "Colleges", to: "/sa/colleges", icon: Building2, load: pages.colleges },
  { label: "College Admins", short: "Admins", to: "/sa/admins", icon: ShieldCheck, load: pages.collegeAdmins },
];

/**
 * Returns nav groups for the current user: [{ label?, items }].
 * Super Admin managing a college also gets the College Admin nav under "Managing: <name>".
 */
export function getNav(role, managedCollege) {
  switch (role) {
    case Role.SUPER_ADMIN: {
      const groups = [{ items: superAdminNav }];
      if (managedCollege) groups.push({ label: `Managing: ${managedCollege.name}`, items: collegeAdminNav });
      groups.push({ items: [profile] });
      return groups;
    }
    case Role.ADMIN:
      return [{ items: [...collegeAdminNav, profile] }];
    case Role.FACULTY:
      return [{ items: [...facultyNav, profile] }];
    case Role.STUDENT:
      return [
        {
          items: [
            { label: "Dashboard", to: "/student", icon: LayoutDashboard, load: pages.studentDashboard, end: true },
            { label: "My Projects", short: "Projects", to: "/student/projects", icon: FolderKanban, load: pages.myProjects },
            profile,
          ],
        },
      ];
    default:
      return [];
  }
}

// Mobile bottom nav: first four items, the rest go in "More"
export const BOTTOM_NAV_COUNT = 4;
