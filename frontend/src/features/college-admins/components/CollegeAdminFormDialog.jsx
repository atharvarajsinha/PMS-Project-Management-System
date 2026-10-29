import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, TextField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { createCollegeAdmin, updateCollegeAdmin } from "@/features/colleges/api";
import { applyApiErrors } from "@/lib/forms";
import { email, name, phone } from "@/lib/schemas";

const createSchema = z.object({ name, email, phone });
const editSchema = z.object({ name, phone });

export default function CollegeAdminFormDialog({ open, onOpenChange, college, admin }) {
  const isEdit = !!admin;
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "" },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({ name: admin?.name || "", email: admin?.email || "", phone: admin?.phone || "" });
  }, [open, admin, form]);

  const mutation = useApiMutation(
    (values) =>
      isEdit
        ? updateCollegeAdmin(college.id, { name: values.name, phone: values.phone || null })
        : createCollegeAdmin(college.id, { name: values.name, email: values.email, phone: values.phone || null }),
    {
      invalidate: [["platform"]],
      success: isEdit ? "College admin updated" : "College admin created. Activate the account to email login details.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (values) =>
    mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, ["name", "email", "phone"])));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit college admin" : "New college admin"}
      description={college?.name}
    >
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
              description={isEdit ? "Email cannot be changed." : "Login details are sent here when the account is activated."}
              className="md:col-span-2"
            />
          </div>
          <FormActions
            onCancel={() => onOpenChange(false)}
            submitLabel={isEdit ? "Save changes" : "Create admin"}
            pending={mutation.isPending}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
