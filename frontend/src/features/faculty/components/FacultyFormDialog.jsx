import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, TextField } from "@/components/common/fields";
import FacultyProfileFields, {
  PROFILE_FIELD_NAMES,
  profileBody,
  profileDefaults,
  profileSchema,
} from "@/features/faculty/components/FacultyProfileFields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { createFaculty, updateFaculty } from "@/features/faculty/api";
import { applyApiErrors } from "@/lib/forms";
import { email, name, phone } from "@/lib/schemas";

const createSchema = z.object({ name, email, phone, ...profileSchema });
const editSchema = z.object({ name, phone, ...profileSchema });

export default function FacultyFormDialog({ open, onOpenChange, faculty }) {
  const isEdit = !!faculty;
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", ...profileDefaults(null) },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({ name: faculty?.name || "", email: faculty?.email || "", phone: faculty?.phone || "", ...profileDefaults(faculty) });
  }, [open, faculty, form]);

  const mutation = useApiMutation(
    (v) =>
      isEdit
        ? updateFaculty(faculty.id, { name: v.name, phone: v.phone || null, ...profileBody(v) })
        : createFaculty({ name: v.name, email: v.email, phone: v.phone || null, ...profileBody(v) }),
    {
      invalidate: [["faculty"], ["specializations"]],
      success: isEdit ? "Faculty updated" : "Faculty created. Activate the account to email login details.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (values) =>
    mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, ["name", "email", "phone", ...PROFILE_FIELD_NAMES])));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit faculty" : "New faculty"} className="sm:max-w-2xl">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <div className="grid gap-6 md:grid-cols-2">
            <TextField control={form.control} name="name" label="Name" required />
            <TextField control={form.control} name="phone" label="Phone" type="tel" />
            <TextField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              required={!isEdit}
              disabled={isEdit}
              description={isEdit ? "Email cannot be changed." : "New accounts start inactive."}
              className="md:col-span-2"
            />
          </div>
          <section className="space-y-4 border-t pt-6">
            <div>
              <h3 className="text-base font-semibold">Profile</h3>
              <p className="text-sm text-muted-foreground">Optional. Faculty can also fill this in themselves from their Profile page.</p>
            </div>
            <FacultyProfileFields form={form} specializationHint="No specializations yet. Add them with Specializations on the Faculty page." />
          </section>
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Create faculty"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}
