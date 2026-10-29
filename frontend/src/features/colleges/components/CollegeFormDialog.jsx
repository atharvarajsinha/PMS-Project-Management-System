import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, TextField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { createCollege, updateCollege } from "@/features/colleges/api";
import { applyApiErrors } from "@/lib/forms";
import { phone } from "@/lib/schemas";

const FIELDS = ["name", "code", "contact_email", "contact_phone", "address"];

const schema = z.object({
  name: z.string().trim().min(2, "Name is required").max(200),
  code: z
    .string()
    .trim()
    .min(2, "2–50 characters")
    .max(50, "2–50 characters")
    .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
  contact_email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  contact_phone: phone,
  address: z.string().trim().max(500).optional().or(z.literal("")),
});

const empty = { name: "", code: "", contact_email: "", contact_phone: "", address: "" };

export default function CollegeFormDialog({ open, onOpenChange, college }) {
  const isEdit = !!college;
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: empty });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset(college ? Object.fromEntries(FIELDS.map((f) => [f, college[f] || ""])) : empty);
  }, [open, college, form]);

  const mutation = useApiMutation(
    (values) => {
      const body = { ...values, code: values.code.toUpperCase() };
      return isEdit ? updateCollege(college.id, body) : createCollege(body);
    },
    {
      invalidate: [["platform", "colleges"]],
      success: isEdit ? "College updated" : "College created",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (values) =>
    mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, FIELDS)));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit college" : "New college"}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <div className="grid gap-6 md:grid-cols-2">
            <TextField control={form.control} name="name" label="Name" required className="md:col-span-2" />
            <TextField
              control={form.control}
              name="code"
              label="Code"
              required
              className="font-mono"
              description="Stored in upper case."
              autoCapitalize="characters"
            />
            <TextField control={form.control} name="contact_phone" label="Contact phone" type="tel" />
            <TextField control={form.control} name="contact_email" label="Contact email" type="email" className="md:col-span-2" />
            <TextField control={form.control} name="address" label="Address" multiline rows={3} className="md:col-span-2" />
          </div>
          <FormActions
            onCancel={() => onOpenChange(false)}
            submitLabel={isEdit ? "Save changes" : "Create college"}
            pending={mutation.isPending}
          />
        </form>
      </Form>
    </FormDialog>
  );
}
