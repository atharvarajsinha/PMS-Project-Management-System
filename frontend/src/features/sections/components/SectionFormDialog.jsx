import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, SelectField, TextField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useFacultyOptions, useSemesterOptions } from "@/hooks/useLookups";
import { createSection, updateSection } from "@/features/sections/api";
import { applyApiErrors } from "@/lib/forms";
import { apiId, idStr } from "@/lib/ids";

const createSchema = z.object({
  semester_id: z.string().min(1, "Choose a semester"),
  name: z.string().trim().min(1, "Name is required").max(100),
  class_teacher_id: z.string().nullable().optional(),
});
const editSchema = z.object({ name: z.string().trim().min(1, "Name is required").max(100) });

export const sectionInvalidate = [["sections"], ["semesters"], ["faculty"], ["section-subjects"], ["semester-subjects"]];

export default function SectionFormDialog({ open, onOpenChange, section, defaultSemesterId }) {
  const isEdit = !!section;
  const [formError, setFormError] = useState(null);
  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    mode: "onTouched",
    defaultValues: { semester_id: "", name: "", class_teacher_id: null },
  });
  const semesters = useSemesterOptions();
  const faculty = useFacultyOptions();
  const close = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({
      semester_id: idStr(section?.semester.id ?? defaultSemesterId),
      name: section?.name || "",
      class_teacher_id: null,
    });
  }, [open, section, defaultSemesterId, form]);

  const mutation = useApiMutation(
    (v) =>
      isEdit
        ? updateSection(section.id, { name: v.name.toUpperCase() })
        : createSection({
            semester_id: apiId(v.semester_id),
            name: v.name.toUpperCase(),
            class_teacher_id: apiId(v.class_teacher_id),
          }),
    {
      invalidate: sectionInvalidate,
      success: isEdit ? "Section updated" : "Section created",
      silentError: true,
      onSuccess: close,
    },
  );

  const onSubmit = (v) =>
    mutation.mutateAsync(v).catch((e) => setFormError(applyApiErrors(form, e, ["semester_id", "name", "class_teacher_id"])));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Rename section" : "New section"}
      description={isEdit ? `Semester ${section.semester.semester_number}. A section can't move to another semester.` : undefined}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <div className="grid gap-6 md:grid-cols-2">
            {!isEdit && (
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
                emptyHint={{ text: "Sections live inside a semester. Create a semester first.", linkLabel: "Go to Semesters", to: "/admin/semesters", onNavigate: close }}
              />
            )}
            <TextField
              control={form.control}
              name="name"
              label="Section name"
              required
              autoCapitalize="characters"
              description="Stored in upper case, e.g. A."
              className={isEdit ? "md:col-span-2" : undefined}
            />
            {!isEdit && (
              <SelectField
                control={form.control}
                name="class_teacher_id"
                label="Class coordinator"
                options={faculty.options}
                loading={faculty.isLoading}
                error={faculty.isError}
                none="No class coordinator yet"
                className="md:col-span-2"
                description="Optional. A faculty member can be class coordinator of one section per semester."
                showHint={faculty.noneAssignable}
                emptyHint={{
                  text: faculty.isEmpty
                    ? "No faculty added yet. You can create the section now and assign a class coordinator later."
                    : "No active faculty yet. Activate a faculty account to assign it, or assign later.",
                  linkLabel: "Go to Faculty",
                  to: "/admin/faculty",
                  onNavigate: close,
                }}
              />
            )}
          </div>
          <FormActions onCancel={close} submitLabel={isEdit ? "Save changes" : "Create section"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}
