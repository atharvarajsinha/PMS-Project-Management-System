import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, TextField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { createFaculty, updateFaculty } from "@/features/faculty/api";
import { applyApiErrors } from "@/lib/forms";
import { email, name, phone } from "@/lib/schemas";

const createSchema = z.object({ name, email, phone });
const editSchema = z.object({ name, phone });

export default function FacultyFormDialog({ open, onOpenChange, faculty }) {
  const isEdit = !!faculty;
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "" },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({ name: faculty?.name || "", email: faculty?.email || "", phone: faculty?.phone || "" });
  }, [open, faculty, form]);

  const mutation = useApiMutation(
    (v) =>
      isEdit
        ? updateFaculty(faculty.id, { name: v.name, phone: v.phone || null })
        : createFaculty({ name: v.name, email: v.email, phone: v.phone || null }),
    {
      invalidate: [["faculty"]],
      success: isEdit ? "Faculty updated" : "Faculty created. Activate the account to email login details.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (values) =>
    mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, ["name", "email", "phone"])));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit faculty" : "New faculty"}>
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
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Create faculty"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}
