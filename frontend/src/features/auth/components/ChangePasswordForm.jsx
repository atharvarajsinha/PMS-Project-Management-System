import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import PasswordInput, { PasswordRules } from "@/components/common/PasswordInput";
import { changePassword } from "@/features/auth/api";
import { changePasswordSchema } from "@/features/auth/schemas";
import { applyApiErrors } from "@/lib/forms";

// Shared by the forced first-login screen and the profile page.
export default function ChangePasswordForm({ onDone, submitLabel = "Change password", fullWidth = false }) {
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    mode: "onTouched",
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });
  const value = form.watch("new_password");

  const onSubmit = async ({ current_password, new_password }) => {
    setFormError(null);
    try {
      const { user } = await changePassword({ current_password, new_password });
      form.reset();
      onDone?.(user);
    } catch (error) {
      setFormError(applyApiErrors(form, error, ["current_password", "new_password"]));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormError message={formError} />
        <FormField
          control={form.control}
          name="current_password"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="new_password"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
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
        <div className={fullWidth ? "[&_button]:w-full" : undefined}>
          <FormActions submitLabel={submitLabel} pending={form.formState.isSubmitting} />
        </div>
      </form>
    </Form>
  );
}
