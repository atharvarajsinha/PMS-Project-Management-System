import { lazy, Suspense } from "react";
import { createBrowserRouter, Outlet } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import AuthLayout from "@/layouts/AuthLayout";
import PageSkeleton from "@/components/common/PageSkeleton";
import {
  HomeRedirect,
  RedirectIfAuthed,
  RequireAuth,
  RequireCollegeContext,
  RequirePasswordChanged,
  RequireRole,
} from "@/routes/guards";
import { pages } from "@/config/nav";
import NotFoundPage from "@/features/errors/NotFoundPage";

const Login = lazy(() => import("@/features/auth/pages/LoginPage"));
const ForgotPassword = lazy(() => import("@/features/auth/pages/ForgotPasswordPage"));
const ResetPassword = lazy(() => import("@/features/auth/pages/ResetPasswordPage"));
const ChangePassword = lazy(() => import("@/features/auth/pages/ChangePasswordPage"));

const SaDashboard = lazy(pages.saDashboard);
const Colleges = lazy(pages.colleges);
const CollegeAdmins = lazy(pages.collegeAdmins);
const AdminDashboard = lazy(pages.adminDashboard);
const Faculty = lazy(pages.faculty);
const Students = lazy(pages.students);
const Semesters = lazy(pages.semesters);
const Subjects = lazy(pages.subjects);
const Sections = lazy(pages.sections);
const Mapping = lazy(pages.mapping);
const Settings = lazy(pages.settings);
const Imports = lazy(pages.imports);
const FacultyDashboard = lazy(pages.facultyDashboard);
const StudentDashboard = lazy(pages.studentDashboard);
const MyClasses = lazy(pages.myClasses);
const ClassSection = lazy(pages.classSection);
const Teaching = lazy(pages.teaching);
const TeachingDetail = lazy(pages.teachingDetail);
const Profile = lazy(pages.profile);

const page = (Component) => (
  <Suspense fallback={<PageSkeleton />}>
    <Component />
  </Suspense>
);

const role = (roles, element) => <RequireRole roles={roles}>{element}</RequireRole>;

export const router = createBrowserRouter([
  {
    element: (
      <RedirectIfAuthed>
        <AuthLayout />
      </RedirectIfAuthed>
    ),
    children: [
      { path: "/login", element: page(Login) },
      { path: "/forgot-password", element: page(ForgotPassword) },
      { path: "/reset-password", element: page(ResetPassword) },
    ],
  },
  {
    element: (
      <RequireAuth>
        <AuthLayout />
      </RequireAuth>
    ),
    children: [{ path: "/change-password", element: page(ChangePassword) }],
  },
  {
    element: (
      <RequireAuth>
        <RequirePasswordChanged>
          <AppLayout />
        </RequirePasswordChanged>
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <HomeRedirect /> },
      { path: "/sa", element: role(["SUPER_ADMIN"], page(SaDashboard)) },
      { path: "/sa/colleges", element: role(["SUPER_ADMIN"], page(Colleges)) },
      { path: "/sa/admins", element: role(["SUPER_ADMIN"], page(CollegeAdmins)) },
      {
        path: "/admin",
        element: role(
          ["ADMIN", "SUPER_ADMIN"],
          <RequireCollegeContext>
            <Outlet />
          </RequireCollegeContext>,
        ),
        children: [
          { index: true, element: page(AdminDashboard) },
          { path: "faculty", element: page(Faculty) },
          { path: "students", element: page(Students) },
          { path: "semesters", element: page(Semesters) },
          { path: "subjects", element: page(Subjects) },
          { path: "sections", element: page(Sections) },
          { path: "mapping", element: page(Mapping) },
          { path: "import", element: page(Imports) },
          { path: "settings", element: page(Settings) },
        ],
      },
      {
        path: "/faculty",
        element: role(["FACULTY"], <Outlet />),
        children: [
          { index: true, element: page(FacultyDashboard) },
          { path: "classes", element: page(MyClasses) },
          { path: "classes/:sectionId", element: page(ClassSection) },
          { path: "teaching", element: page(Teaching) },
          { path: "teaching/:id", element: page(TeachingDetail) },
        ],
      },
      { path: "/student", element: role(["STUDENT"], page(StudentDashboard)) },
      { path: "/profile", element: page(Profile) },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
