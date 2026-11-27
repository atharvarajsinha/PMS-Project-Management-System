import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import { requestPasswordReset } from "@/features/auth/api";
import { forgotSchema } from "@/features/auth/schemas";
import { applyApiErrors } from "@/lib/forms";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(forgotSchema), mode: "onTouched", defaultValues: { email: "" } });

  const onSubmit = async ({ email }) => {
    setFormError(null);
    try {
      await requestPasswordReset({ email });
      navigate("/reset-password", { state: { email: email.trim().toLowerCase(), sentAt: Date.now() } });
    } catch (error) {
      if (error.code === "RATE_LIMITED") return setFormError("Too many requests. Please wait a few minutes and try again.");
      setFormError(applyApiErrors(form, error, ["email"]));
    }
  };

  return (
    <div>
      <h1 className="mb-2 text-center text-2xl font-bold tracking-tight sm:text-3xl">Forgot password</h1>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        Enter your account email. If it exists, we'll send you a 6-digit code.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-3">
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="[&_button]:w-full">
            <FormActions submitLabel="Send code" pending={form.formState.isSubmitting} />
          </div>
        </form>
      </Form>
      <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm text-primary underline-offset-4 hover:underline">
        <ArrowLeft className="size-4" /> Back to sign in
      </Link>
    </div>
  );
}
