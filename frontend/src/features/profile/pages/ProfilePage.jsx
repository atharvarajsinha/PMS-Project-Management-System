import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import PageHeader from "@/components/common/PageHeader";
import RequiredMark from "@/components/common/RequiredMark";
import ChangePasswordForm from "@/features/auth/components/ChangePasswordForm";
import { updateMe } from "@/features/auth/api";
import { useAuth } from "@/context/AuthContext";
import { applyApiErrors } from "@/lib/forms";
import { formatDateTime } from "@/lib/utils";
import { phone } from "@/lib/schemas";
import { labelOf, Role } from "@/config/choices";
import FacultyProfileCard from "@/features/profile/components/FacultyProfileCard";

const schema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone,
});

function ReadOnly({ label, value, mono }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-[13px] font-medium" : "text-sm"}>{value || "—"}</dd>
    </div>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: user.name || "", phone: user.phone || "" },
  });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const me = await updateMe({ name: values.name, phone: values.phone || "" });
      setUser(me);
      form.reset({ name: me.name, phone: me.phone || "" });
      toast.success("Profile updated", { duration: 3000 });
    } catch (error) {
      setFormError(applyApiErrors(form, error, ["name", "phone"]));
    }
  };

  return (
    <>
      <PageHeader title="Profile" description="Your personal details and password." />
      <div className="grid items-start gap-8 xl:grid-cols-[1fr_380px]">
        <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="details-title">
          <h2 id="details-title" className="mb-6 text-lg font-semibold">
            Details
          </h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
              <FormError message={formError} />
              <div className="grid gap-6 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>
                        Name
                        <RequiredMark />
                      </FormLabel>
                      <FormControl>
                        <Input autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" autoComplete="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* not a form field: FormLabel/FormDescription need a FormField context */}
                <div className="space-y-3 sm:col-span-2">
                  <Label htmlFor="profile-email">Email</Label>
                  <Input id="profile-email" value={user.email} disabled readOnly aria-describedby="profile-email-hint" />
                  <p id="profile-email-hint" className="text-[0.8rem] text-muted-foreground">
                    Email cannot be changed.
                  </p>
                </div>
              </div>
              <dl className="grid gap-4 border-t pt-6 sm:grid-cols-2">
                <ReadOnly label="Role" value={labelOf("Role", user.role)} />
                {user.college && <ReadOnly label="College" value={user.college.name} />}
                {user.student && <ReadOnly label="Roll number" value={user.student.roll_number} mono />}
                {user.student && (
                  <ReadOnly
                    label="Semester · Section"
                    value={`Semester ${user.student.semester?.semester_number} · Section ${user.student.section?.name}`}
                  />
                )}
                <ReadOnly label="Last login" value={formatDateTime(user.last_login_at)} />
              </dl>
              <FormActions submitLabel="Save changes" pending={form.formState.isSubmitting} disabled={!form.formState.isDirty} />
            </form>
          </Form>
        </section>

        <section className="rounded-lg border bg-card p-4 md:p-6" aria-labelledby="password-title">
          <h2 id="password-title" className="mb-6 text-lg font-semibold">
            Change password
          </h2>
          <ChangePasswordForm
            onDone={(me) => {
              setUser(me);
              toast.success("Password changed", { duration: 3000 });
            }}
            fullWidth
          />
        </section>
        {user.role === Role.FACULTY && (
          <div className="xl:col-span-2">
            <FacultyProfileCard />
          </div>
        )}
      </div>
    </>
  );
}
