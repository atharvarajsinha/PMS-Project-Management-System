import { Navigate, useLocation } from "react-router-dom";
import { HOME_BY_ROLE, useAuth } from "@/context/AuthContext";
import { useCollege } from "@/context/CollegeContext";
import ForbiddenPage from "@/features/errors/ForbiddenPage";
import FullPageLoader from "@/components/common/FullPageLoader";

export function RequireAuth({ children }) {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export function RequirePasswordChanged({ children }) {
  const { user } = useAuth();
  if (user?.must_change_password) return <Navigate to="/change-password" replace />;
  return children;
}

export function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <ForbiddenPage />;
  return children;
}

// College-scoped admin pages: Super Admin must pick a college first (X-College-Id).
export function RequireCollegeContext({ children }) {
  const { user } = useAuth();
  const { college } = useCollege();
  if (user?.role === "SUPER_ADMIN" && !college) return <Navigate to="/sa/colleges" replace />;
  return children;
}

// Public pages: a logged-in user goes to their home instead
export function RedirectIfAuthed({ children }) {
  const { user, status } = useAuth();
  if (status === "loading") return <FullPageLoader />;
  if (user) {
    return <Navigate to={user.must_change_password ? "/change-password" : HOME_BY_ROLE[user.role] || "/"} replace />;
  }
  return children;
}

export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={HOME_BY_ROLE[user?.role] || "/login"} replace />;
}
