import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, SelectField } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useFacultyOptions } from "@/hooks/useLookups";
import { setClassTeacher } from "@/features/sections/api";
import { sectionInvalidate } from "@/features/sections/components/SectionFormDialog";
import { applyApiErrors } from "@/lib/forms";
import { apiId, idStr } from "@/lib/ids";

const schema = z.object({ faculty_id: z.string({ error: "Choose a faculty member" }).min(1, "Choose a faculty member") });

export default function ClassTeacherDialog({ section, onOpenChange }) {
  const open = !!section;
  const [formError, setFormError] = useState(null);
  const faculty = useFacultyOptions();
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { faculty_id: "" } });
  const close = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({ faculty_id: idStr(section.class_teacher?.id) });
  }, [open, section, form]);

  const mutation = useApiMutation((v) => setClassTeacher(section.id, apiId(v.faculty_id)), {
    invalidate: sectionInvalidate,
    success: "Class coordinator assigned",
    silentError: true,
    onSuccess: close,
  });

  // 409 names the other section this faculty already leads in the semester
  const onSubmit = (v) => mutation.mutateAsync(v).catch((e) => setFormError(applyApiErrors(form, e, ["faculty_id"])));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign class coordinator"
      description={section ? `Semester ${section.semester.semester_number} · Section ${section.name}` : undefined}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <SelectField
            control={form.control}
            name="faculty_id"
            label="Faculty"
            required
            options={faculty.options}
            loading={faculty.isLoading}
            error={faculty.isError}
            placeholder="Choose faculty"
            emptyText="No faculty yet"
            description="Only active faculty can be assigned."
            showHint={faculty.noneAssignable}
            emptyHint={{
              text: faculty.isEmpty
                ? "No faculty added yet. Add faculty and activate their accounts first."
                : "No active faculty. Activate a faculty account first.",
              linkLabel: "Go to Faculty",
              to: "/admin/faculty",
              onNavigate: close,
            }}
          />
          <FormActions onCancel={close} submitLabel="Assign" pending={mutation.isPending} disabled={faculty.noneAssignable} />
        </form>
      </Form>
    </FormDialog>
  );
}
