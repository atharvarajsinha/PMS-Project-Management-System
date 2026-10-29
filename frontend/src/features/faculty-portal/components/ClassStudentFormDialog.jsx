import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, TextField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { createClassStudent, updateClassStudent } from "@/features/faculty-portal/api";
import { applyApiErrors } from "@/lib/forms";
import { email, name, phone } from "@/lib/schemas";

const FIELDS = ["name", "email", "phone", "roll_number"];

const base = { name, phone, roll_number: z.string().trim().min(1, "Roll number is required").max(50) };
const createSchema = z.object({ ...base, email });
const editSchema = z.object(base);

// Class teacher's add/edit student form: the section is always the teacher's own section.
export default function ClassStudentFormDialog({ open, onOpenChange, section, student }) {
  const isEdit = !!student;
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", roll_number: "" },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({
      name: student?.name || "",
      email: student?.email || "",
      phone: student?.phone || "",
      roll_number: student?.roll_number || "",
    });
  }, [open, student, form]);

  const mutation = useApiMutation(
    (v) => {
      const body = { name: v.name, phone: v.phone || "", roll_number: v.roll_number };
      return isEdit ? updateClassStudent(section.id, student.id, body) : createClassStudent(section.id, { ...body, email: v.email });
    },
    {
      invalidate: [["my"]],
      success: isEdit ? "Student updated" : "Student added. Activate the account to email login details.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (values) =>
    mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, FIELDS)));

  const where = section ? `Semester ${section.semester?.semester_number} · Section ${section.name}` : "";

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit student" : "Add student"}
      description={isEdit ? undefined : `The student is added to ${where}.`}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <div className="grid gap-6 md:grid-cols-2">
            <TextField control={form.control} name="name" label="Name" required />
            <TextField control={form.control} name="roll_number" label="Roll number" required className="[&_input]:font-mono" />
            <TextField
              control={form.control}
              name="email"
              label="Email"
              type="email"
              required={!isEdit}
              disabled={isEdit}
              description={isEdit ? "Email cannot be changed." : "Login details are sent here when the account is activated."}
            />
            <TextField control={form.control} name="phone" label="Phone" type="tel" />
          </div>
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Add student"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}
