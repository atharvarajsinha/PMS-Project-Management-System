import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ChangePasswordForm from "@/features/auth/components/ChangePasswordForm";
import { HOME_BY_ROLE, useAuth } from "@/context/AuthContext";

// Forced on first login; the user can't reach the app until it's done (only logout is offered).
export default function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();

  if (!user.must_change_password) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  const onDone = (me) => {
    setUser(me);
    toast.success("Password changed", { duration: 3000 });
    navigate(HOME_BY_ROLE[me.role], { replace: true });
  };

  return (
    <div>
      <h1 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">Set your password</h1>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        You're signed in with a temporary password. Choose a new one to continue.
      </p>
      <ChangePasswordForm onDone={onDone} submitLabel="Set password" fullWidth />
      <button
        type="button"
        onClick={async () => {
          await logout();
          navigate("/login", { replace: true });
        }}
        className="mt-6 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Log out
      </button>
    </div>
  );
}
