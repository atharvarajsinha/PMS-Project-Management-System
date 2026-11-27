import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, SelectField, TextField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useSectionOptions, useSemesterOptions } from "@/hooks/useLookups";
import { createStudent, updateStudent } from "@/features/students/api";
import { applyApiErrors } from "@/lib/forms";
import { apiId, idStr } from "@/lib/ids";
import { email, name, phone } from "@/lib/schemas";

const FIELDS = ["name", "email", "phone", "roll_number", "section_id"];

const base = {
  name,
  phone,
  roll_number: z.string().trim().min(1, "Roll number is required").max(50),
  semester_id: z.string({ error: "Choose a semester" }).min(1, "Choose a semester"),
  section_id: z.string({ error: "Choose a section" }).min(1, "Choose a section"),
};
const createSchema = z.object({ ...base, email });
const editSchema = z.object(base);

export default function StudentFormDialog({ open, onOpenChange, student }) {
  const isEdit = !!student;
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    mode: "onTouched",
    defaultValues: { name: "", email: "", phone: "", roll_number: "", semester_id: "", section_id: "" },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({
      name: student?.name || "",
      email: student?.email || "",
      phone: student?.phone || "",
      roll_number: student?.roll_number || "",
      semester_id: idStr(student?.semester?.id),
      section_id: idStr(student?.section?.id),
    });
  }, [open, student, form]);

  // Semester only narrows the section list; the API derives it from the section.
  const semesterId = form.watch("semester_id");
  const semesters = useSemesterOptions();
  const sections = useSectionOptions(semesterId, { enabled: !!semesterId });
  const sectionId = form.watch("section_id");
  const semesterLabel = semesters.options.find((o) => o.value === semesterId)?.label || "This semester";
  const close = () => onOpenChange(false);

  // Changing semester clears a section that doesn't belong to it
  useEffect(() => {
    if (sectionId && sections.isSuccess && !sections.options.some((o) => o.value === sectionId)) {
      form.setValue("section_id", "");
    }
  }, [sectionId, sections.isSuccess, sections.options, form]);

  const mutation = useApiMutation(
    (v) => {
      const body = { name: v.name, phone: v.phone || null, roll_number: v.roll_number, section_id: apiId(v.section_id) };
      return isEdit ? updateStudent(student.id, body) : createStudent({ ...body, email: v.email });
    },
    {
      invalidate: [["students"], ["sections"], ["semesters"]],
      success: isEdit ? "Student updated" : "Student created. Activate the account to email login details.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (values) =>
    mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, FIELDS)));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit student" : "New student"}>
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
              description={isEdit ? "Email cannot be changed." : undefined}
            />
            <TextField control={form.control} name="phone" label="Phone" type="tel" />
            <SelectField
              control={form.control}
              name="semester_id"
              label="Semester"
              required
              options={semesters.options}
              loading={semesters.isLoading}
              error={semesters.isError}
              placeholder="Choose semester"
              emptyText="No semesters yet"
              emptyHint={{ text: "Students belong to a semester. Create one first.", linkLabel: "Go to Semesters", to: "/admin/semesters", onNavigate: close }}
            />
            <SelectField
              control={form.control}
              name="section_id"
              label="Section"
              required
              options={sections.options}
              disabled={!semesterId}
              loading={!!semesterId && sections.isLoading}
              error={sections.isError}
              placeholder={semesterId ? "Choose section" : "Choose a semester first"}
              emptyText="No sections in this semester"
              emptyHint={
                semesterId && {
                  text: `${semesterLabel} has no sections yet. Add one, then come back.`,
                  linkLabel: "Go to Sections",
                  to: `/admin/sections?semester_id=${semesterId}`,
                  onNavigate: close,
                }
              }
              description={isEdit ? "Use this to correct mistakes. Promotion comes later." : undefined}
            />
          </div>
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Create student"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}
