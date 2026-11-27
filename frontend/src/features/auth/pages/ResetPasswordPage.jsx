import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import OtpInput from "@/components/common/OtpInput";
import PasswordInput, { PasswordRules } from "@/components/common/PasswordInput";
import { confirmPasswordReset, requestPasswordReset, verifyPasswordReset } from "@/features/auth/api";
import { resetSchema } from "@/features/auth/schemas";
import { applyApiErrors } from "@/lib/forms";

const RESEND_AFTER = 60;

function OtpStep({ email, onVerified }) {
  const location = useLocation();
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [sentAt, setSentAt] = useState(location.state?.sentAt || Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const wait = Math.max(0, RESEND_AFTER - Math.floor((now - sentAt) / 1000));

  const verify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return setError("Enter the 6-digit code.");
    setError(null);
    setPending(true);
    try {
      const { reset_token } = await verifyPasswordReset({ email, otp });
      onVerified(reset_token);
    } catch (err) {
      setError(err.details?.otp?.join(" ") || err.message);
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    try {
      await requestPasswordReset({ email });
      setSentAt(Date.now());
      setOtp("");
      toast.success("A new code has been sent", { duration: 3000 });
    } catch (err) {
      toast.error(err.message, { duration: 5000 });
    }
  };

  return (
    <form onSubmit={verify} className="space-y-6" noValidate>
      <p className="text-center text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It's valid for 10 minutes.
      </p>
      <div className="space-y-3">
        <OtpInput value={otp} onChange={setOtp} invalid={!!error} autoFocus />
        {error && (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Verify code
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Didn't get it?{" "}
        {wait > 0 ? (
          <span className="tabular-nums">Resend in {wait}s</span>
        ) : (
          <button type="button" onClick={resend} className="text-primary underline-offset-4 hover:underline">
            Resend code
          </button>
        )}
      </p>
    </form>
  );
}

function NewPasswordStep({ resetToken, onRestart }) {
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(resetSchema),
    mode: "onTouched",
    defaultValues: { new_password: "", confirm_password: "" },
  });
  const value = form.watch("new_password");

  const onSubmit = async ({ new_password }) => {
    setFormError(null);
    try {
      await confirmPasswordReset({ reset_token: resetToken, new_password });
      toast.success("Password reset. Sign in with your new password.", { duration: 3000 });
      navigate("/login", { replace: true });
    } catch (error) {
      if (error.details?.reset_token) {
        setFormError("This reset link has expired. Request a new code.");
        return;
      }
      setFormError(applyApiErrors(form, error, ["new_password"]));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormError message={formError} />
        {formError?.includes("expired") && (
          <Button type="button" variant="outline" className="w-full" onClick={onRestart}>
            Request a new code
          </Button>
        )}
        <FormField
          control={form.control}
          name="new_password"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" autoFocus {...field} />
              </FormControl>
              <FormDescription asChild>
                <div>
                  <PasswordRules value={value} />
                </div>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm_password"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="[&_button]:w-full">
          <FormActions submitLabel="Reset password" pending={form.formState.isSubmitting} />
        </div>
      </form>
    </Form>
  );
}

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email;
  const [resetToken, setResetToken] = useState(null);

  if (!email) return <Navigate to="/forgot-password" replace />;

  return (
    <div>
      <h1 className="mb-6 text-center text-2xl font-bold tracking-tight sm:text-3xl">
        {resetToken ? "Set new password" : "Enter code"}
      </h1>
      {resetToken ? (
        <NewPasswordStep resetToken={resetToken} onRestart={() => navigate("/forgot-password", { replace: true })} />
      ) : (
        <OtpStep email={email} onVerified={setResetToken} />
      )}
      <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </div>
  );
}
