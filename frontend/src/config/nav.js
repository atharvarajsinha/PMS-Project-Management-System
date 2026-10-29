import {
  BookOpen,
  Building2,
  CalendarRange,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Network,
  Settings,
  ShieldCheck,
  Upload,
  UserRound,
  Users,
} from "lucide-react";

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
  facultyDashboard: () => import("@/features/dashboard/pages/FacultyDashboard"),
  studentDashboard: () => import("@/features/dashboard/pages/StudentDashboard"),
  myClasses: () => import("@/features/faculty-portal/pages/ClassesPage"),
  classSection: () => import("@/features/faculty-portal/pages/ClassSectionPage"),
  teaching: () => import("@/features/faculty-portal/pages/TeachingPage"),
  teachingDetail: () => import("@/features/faculty-portal/pages/TeachingDetailPage"),
  profile: () => import("@/features/profile/pages/ProfilePage"),
};

export { pages };

const profile = { label: "Profile", to: "/profile", icon: UserRound, load: pages.profile };

export const facultyNav = [
  { label: "Dashboard", to: "/faculty", icon: LayoutDashboard, load: pages.facultyDashboard, end: true },
  { label: "My Classes", short: "Classes", to: "/faculty/classes", icon: LayoutGrid, load: pages.myClasses },
  { label: "Teaching", to: "/faculty/teaching", icon: BookOpen, load: pages.teaching },
];

export const collegeAdminNav = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard, load: pages.adminDashboard, end: true },
  { label: "Faculty", to: "/admin/faculty", icon: GraduationCap, load: pages.faculty },
  { label: "Students", to: "/admin/students", icon: Users, load: pages.students },
  { label: "Semesters", to: "/admin/semesters", icon: CalendarRange, load: pages.semesters },
  { label: "Subjects", to: "/admin/subjects", icon: BookOpen, load: pages.subjects },
  { label: "Sections & Class Teachers", short: "Sections", to: "/admin/sections", icon: LayoutGrid, load: pages.sections },
  { label: "Subject Mapping", short: "Mapping", to: "/admin/mapping", icon: Network, load: pages.mapping },
  { label: "Import Data", short: "Import", to: "/admin/import", icon: Upload, load: pages.imports },
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
    case "SUPER_ADMIN": {
      const groups = [{ items: superAdminNav }];
      if (managedCollege) groups.push({ label: `Managing: ${managedCollege.name}`, items: collegeAdminNav });
      groups.push({ items: [profile] });
      return groups;
    }
    case "ADMIN":
      return [{ items: [...collegeAdminNav, profile] }];
    case "FACULTY":
      return [{ items: [...facultyNav, profile] }];
    case "STUDENT":
      return [{ items: [{ label: "Dashboard", to: "/student", icon: LayoutDashboard, load: pages.studentDashboard, end: true }, profile] }];
    default:
      return [];
  }
}

// Mobile bottom nav: first four items, the rest go in "More"
export const BOTTOM_NAV_COUNT = 4;
