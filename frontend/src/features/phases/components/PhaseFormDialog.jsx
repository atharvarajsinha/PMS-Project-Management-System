import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { Form, MarkdownField, SelectField, TextField } from "@/components/common/fields";
import { createPhase, phasesInvalidate, updatePhase } from "@/features/phases/api";
import CriteriaEditor, { criteriaBody, criteriaDefaults, criteriaSchema } from "@/features/phases/components/CriteriaEditor";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useOfferingOptions } from "@/hooks/useLookups";
import { applyApiErrors } from "@/lib/forms";
import { apiId, idStr } from "@/lib/ids";

const schema = z
  .object({
    semester_subject_id: z.string().min(1, "Choose a subject"),
    name: z.string().trim().min(1, "Enter a name").max(150),
    short_description: z.string().trim().max(300).optional(),
    description: z.string().trim().optional(),
    start_date: z.string().min(1, "Pick a start date"),
    end_date: z.string().min(1, "Pick an end date"),
    evaluation_end_date: z.string().optional(),
    max_marks: z.coerce.number({ error: "Enter a number" }).min(0, "Can't be negative").max(9999),
    criteria: criteriaSchema,
  })
  .refine((v) => !v.start_date || !v.end_date || v.end_date > v.start_date, {
    path: ["end_date"],
    message: "End date must be after the start date",
  })
  .refine((v) => !v.evaluation_end_date || !v.end_date || v.evaluation_end_date >= v.end_date, {
    path: ["evaluation_end_date"],
    message: "Can't be before the end date",
  });

const FIELDS = ["semester_subject_id", "name", "short_description", "description", "start_date", "end_date", "evaluation_end_date", "max_marks", "criteria"];

export default function PhaseFormDialog({ open, onOpenChange, phase, defaultOfferingId }) {
  const isEdit = !!phase;
  const [formError, setFormError] = useState(null);
  const offerings = useOfferingOptions();
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({
      semester_subject_id: idStr(phase?.semester_subject_id ?? defaultOfferingId),
      name: phase?.name ?? "",
      short_description: phase?.short_description ?? "",
      description: phase?.description ?? "",
      start_date: phase?.start_date ?? "",
      end_date: phase?.end_date ?? "",
      evaluation_end_date: phase?.evaluation_end_date ?? "",
      max_marks: phase?.max_marks ?? "",
      criteria: criteriaDefaults(phase?.criteria),
    });
  }, [open, phase, defaultOfferingId, form]);

  const mutation = useApiMutation(
    (v) => {
      const body = {
        ...v,
        semester_subject_id: apiId(v.semester_subject_id),
        evaluation_end_date: v.evaluation_end_date || null,
        criteria: criteriaBody(v.criteria),
      };
      if (isEdit) delete body.semester_subject_id;
      return isEdit ? updatePhase(phase.id, body) : createPhase(body);
    },
    {
      invalidate: phasesInvalidate,
      success: isEdit ? "Phase updated" : "Phase created. Every team of this subject now has an evaluator for it.",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (v) => mutation.mutateAsync(v).catch((e) => setFormError(applyApiErrors(form, e, FIELDS)));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit phase" : "New phase"}
      description="Phases of a subject can't overlap. Both dates are included: submissions are open from the start date through the end date."
      className="sm:max-w-2xl"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <SelectField
            control={form.control}
            name="semester_subject_id"
            label="Subject"
            required
            options={offerings.options}
            loading={offerings.isLoading}
            error={offerings.isError}
            disabled={isEdit}
            emptyHint={{ text: "Offer subjects in a semester first.", linkLabel: "Subject Mapping", to: "/admin/mapping" }}
          />
          <TextField control={form.control} name="name" label="Name" required placeholder="Project Proposal" />
          <TextField control={form.control} name="short_description" label="Short description" placeholder="One line shown in lists" />
          <MarkdownField
            control={form.control}
            name="description"
            label="Details"
            rows={6}
            placeholder="What teams must submit"
            description="Select text and use the toolbar (or Ctrl+B / Ctrl+I) for bold, italic, lists and links."
          />
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField control={form.control} name="start_date" label="Start date" type="date" required />
            <TextField control={form.control} name="end_date" label="End date" type="date" required description="Last day for submissions." />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="evaluation_end_date"
              label="Evaluation ends"
              type="date"
              description="Optional. Marks lock automatically after this day."
            />
            <TextField control={form.control} name="max_marks" label="Maximum marks" type="number" inputMode="decimal" min={0} step="0.5" required />
          </div>
          <CriteriaEditor form={form} />
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Create phase"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}
