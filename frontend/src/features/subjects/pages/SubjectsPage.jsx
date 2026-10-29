import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
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
import SearchInput from "@/components/common/SearchInput";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect, Form, TextField } from "@/components/common/fields";
import ImportButton from "@/features/imports/components/ImportButton";
import { bulkDeleteSubjects, createSubject, deleteSubject, listSubjects, updateSubject } from "@/features/subjects/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { applyApiErrors } from "@/lib/forms";

const schema = z.object({
  code: z.string().trim().min(1, "Code is required").max(50),
  name: z.string().trim().min(2, "Name is required").max(200),
});

const invalidateAll = [["subjects"], ["semesters"], ["semester-subjects"], ["section-subjects"], ["sections"]];

function SubjectFormDialog({ open, onOpenChange, subject }) {
  const isEdit = !!subject;
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { code: "", name: "" } });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    form.reset({ code: subject?.code || "", name: subject?.name || "" });
  }, [open, subject, form]);

  const mutation = useApiMutation(
    (v) => {
      const body = { ...v, code: v.code.toUpperCase() };
      return isEdit ? updateSubject(subject.id, body) : createSubject(body);
    },
    {
      invalidate: invalidateAll,
      success: isEdit ? "Subject updated" : "Subject created",
      silentError: true,
      onSuccess: () => onOpenChange(false),
    },
  );

  const onSubmit = (v) => mutation.mutateAsync(v).catch((e) => setFormError(applyApiErrors(form, e, ["code", "name"])));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={isEdit ? "Edit subject" : "New subject"}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <FormError message={formError} />
          <div className="grid gap-6 md:grid-cols-[160px_1fr]">
            <TextField control={form.control} name="code" label="Code" required className="[&_input]:font-mono" autoCapitalize="characters" />
            <TextField control={form.control} name="name" label="Name" required />
          </div>
          <FormActions onCancel={() => onOpenChange(false)} submitLabel={isEdit ? "Save changes" : "Create subject"} pending={mutation.isPending} />
        </form>
      </Form>
    </FormDialog>
  );
}

export default function SubjectsPage() {
  const { params, setParam } = useListParams({ ordering: "code" });
  const [form, setForm] = useState({ open: false, subject: null });
  const [toDelete, setToDelete] = useState(null);
  const semesters = useSemesterOptions();

  const query = usePagedList(["subjects", "list"], listSubjects, params, setParam);
  const remove = useApiMutation((s) => deleteSubject(s.id), { invalidate: invalidateAll, success: "Subject deleted" });
  const selection = useSelection();
  const select = selectColumn(selection, query.data?.results, (s) => s.code);

  const offeredIn = (s) => (s.offered_in.length ? [...s.offered_in].sort((a, b) => a - b).map((n) => `Sem ${n}`).join(", ") : "Not offered");

  const actions = (s) => (
    <RowActions
      label={`Actions for ${s.code}`}
      items={[
        { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, subject: s }) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setToDelete(s) },
      ]}
    />
  );

  const columns = [
    select,
    { key: "code", header: "Code", className: "w-32", cell: (s) => <span className="font-mono text-[13px] font-medium">{s.code}</span> },
    { key: "name", header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "offered", header: "Offered in", cell: (s) => <span className="text-muted-foreground">{offeredIn(s)}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (s) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="pt-0.5">{select.cell(s)}</div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[13px] font-medium">{s.code}</p>
          <p className="truncate font-medium">{s.name}</p>
        </div>
        {actions(s)}
      </div>
      <CardFields fields={[["Offered in", offeredIn(s)]]} />
    </>
  );

  const filtered = params.search || params.semester_id;

  return (
    <>
      <PageHeader
        title="Subjects"
        description="The college's subject catalogue. Offer subjects in semesters under Subject Mapping."
        actions={
          <>
            <ImportButton kind="subjects" />
            <Button onClick={() => setForm({ open: true, subject: null })}>
              <Plus className="size-4" /> New subject
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search code or name…" />
        <FilterSelect label="Offered in" value={params.semester_id} onChange={(v) => setParam("semester_id", v)} options={semesters.options} loading={semesters.isLoading} emptyText="No semesters yet — create one under Semesters" allLabel="All semesters" />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BulkDeleteButton
          selection={selection}
          noun={selection.count === 1 ? "subject" : "subjects"}
          mutationFn={bulkDeleteSubjects}
          invalidate={invalidateAll}
          description="Their semester offerings, section mappings and faculty assignments are removed too."
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
            icon={BookOpen}
            title={filtered ? "No subjects match" : "No subjects yet"}
            description={filtered ? "Try a different search or filter." : "Add the subjects your college teaches."}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <SubjectFormDialog open={form.open} subject={form.subject} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={() => setToDelete(null)}
        title={`Delete subject ${toDelete?.code}?`}
        description="This also removes all its semester offerings and section mappings. This cannot be undone."
        confirmText={toDelete?.code}
        onConfirm={() => remove.mutateAsync(toDelete)}
      />
    </>
  );
}
