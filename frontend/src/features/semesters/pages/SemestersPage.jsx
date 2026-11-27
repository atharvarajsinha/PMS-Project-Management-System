import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarRange, LayoutGrid, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import BulkBar from "@/components/common/BulkBar";
import BulkDeleteButton, { selectColumn } from "@/components/common/BulkDeleteButton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import { Form, TextField } from "@/components/common/fields";
import ImportButton from "@/features/imports/components/ImportButton";
import { bulkDeleteSemesters, createSemester, deleteSemester, listSemesters, updateSemester } from "@/features/semesters/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { applyApiErrors } from "@/lib/forms";

const schema = z.object({
  semester_number: z.coerce.number({ error: "Enter a number" }).int("Whole numbers only").min(1, "1–12").max(12, "1–12"),
});

function SemesterFormDialog({ open, onOpenChange, semester }) {
  const isEdit = !!semester;
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { semester_number: "" } });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({ semester_number: semester?.semester_number ?? "" });
  }, [open, semester, form]);

  const mutation = useApiMutation((v) => (isEdit ? updateSemester(semester.id, v) : createSemester(v)), {
    invalidate: [["semesters"], ["sections"], ["students"], ["subjects"], ["semester-subjects"], ["section-subjects"]],
    success: isEdit ? "Semester updated" : "Semester created",
    silentError: true,
    onSuccess: () => onOpenChange(false),
  });

  const onSubmit = (v) => mutation.mutateAsync(v).catch((e) => setFormError(applyApiErrors(form, e, ["semester_number"])));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit semester" : "New semester"}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <TextField
            control={form.control}
            name="semester_number"
            label="Semester number"
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={12}
            description="Semesters are reused by every batch, so each number exists once."
          />
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Create semester"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}

export default function SemestersPage() {
  const navigate = useNavigate();
  const { params, setParam } = useListParams({ ordering: "semester_number" });
  const [form, setForm] = useState({ open: false, semester: null });
  const [toDelete, setToDelete] = useState(null);

  const query = usePagedList(["semesters", "list"], listSemesters, params, setParam);
  const selection = useSelection();
  const invalidate = [["semesters"], ["sections"], ["subjects"], ["semester-subjects"], ["section-subjects"]];
  const remove = useApiMutation((s) => deleteSemester(s.id), { invalidate, success: "Semester deleted" });
  const select = selectColumn(selection, query.data?.results, (s) => `semester ${s.semester_number}`);

  const actions = (s) => (
    <RowActions
      label={`Actions for semester ${s.semester_number}`}
      items={[
        { label: "View sections", icon: LayoutGrid, onSelect: () => navigate(`/admin/sections?semester_id=${s.id}`) },
        { label: "View students", icon: Users, onSelect: () => navigate(`/admin/students?semester_id=${s.id}`) },
        { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, semester: s }) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setToDelete(s) },
      ]}
    />
  );

  const columns = [
    select,
    { key: "num", header: "Semester", cell: (s) => <span className="font-medium">Semester {s.semester_number}</span> },
    { key: "sections", header: "Sections", className: "tabular-nums", cell: (s) => s.sections_count },
    { key: "subjects", header: "Subjects", className: "tabular-nums", cell: (s) => s.subjects_count },
    { key: "students", header: "Students", className: "tabular-nums", cell: (s) => s.students_count },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (s) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {select.cell(s)}
          <p className="font-medium">Semester {s.semester_number}</p>
        </div>
        {actions(s)}
      </div>
      <CardFields
        fields={[
          ["Sections", s.sections_count],
          ["Subjects", s.subjects_count],
          ["Students", s.students_count],
        ]}
      />
    </>
  );

  return (
    <>
      <PageHeader
        title="Semesters"
        description="Semesters group sections and subject offerings."
        actions={
          <>
            <ImportButton kind="semesters" />
            <Button onClick={() => setForm({ open: true, semester: null })}>
              <Plus className="size-4" /> New semester
            </Button>
          </>
        }
      />
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BulkDeleteButton
          selection={selection}
          noun={selection.count === 1 ? "semester" : "semesters"}
          mutationFn={bulkDeleteSemesters}
          invalidate={invalidate}
          description="Their sections, subject offerings and faculty assignments are removed too. Semesters whose sections still have students are skipped."
        />
      </BulkBar>
      <DataView
        columns={columns}
        rows={query.data?.results}
        renderCard={renderCard}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={
          <EmptyState
            icon={CalendarRange}
            title="No semesters yet"
            description="Create semesters before adding sections and students."
            action={
              <Button onClick={() => setForm({ open: true, semester: null })}>
                <Plus className="size-4" /> New semester
              </Button>
            }
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <SemesterFormDialog open={form.open} semester={form.semester} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={() => setToDelete(null)}
        title={`Delete semester ${toDelete?.semester_number}?`}
        description="This also removes its sections, subject offerings and faculty assignments. It's blocked while any section still has students. This cannot be undone."
        confirmText={toDelete ? `Semester ${toDelete.semester_number}` : ""}
        onConfirm={() => remove.mutateAsync(toDelete)}
      />
    </>
  );
}
