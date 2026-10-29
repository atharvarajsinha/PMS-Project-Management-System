import { useState } from "react";
import { Mail, Pencil, Plus, Power, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import BulkBar from "@/components/common/BulkBar";
import BulkDeleteButton from "@/components/common/BulkDeleteButton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import SearchInput from "@/components/common/SearchInput";
import StatusBadge from "@/components/common/StatusBadge";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect, STATUS_OPTIONS } from "@/components/common/fields";
import ImportButton from "@/features/imports/components/ImportButton";
import StudentFormDialog from "@/features/students/components/StudentFormDialog";
import {
  activateStudent,
  bulkActivateStudents,
  bulkDeactivateStudents,
  bulkDeleteStudents,
  deactivateStudent,
  deleteStudent,
  listStudents,
  resendStudentCredentials,
} from "@/features/students/api";
import { bulkMessage, useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useSectionOptions, useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { apiId, sameId } from "@/lib/ids";

const ACTIVATED = "Account activated. Login details have been emailed.";

export default function StudentsPage() {
  const { params, setParam, setParams } = useListParams({ ordering: "roll_number" });
  const [form, setForm] = useState({ open: false, student: null });
  const [confirm, setConfirm] = useState(null); // { type, student?, body?, label? }
  const selection = useSelection();

  const semesters = useSemesterOptions();
  const sections = useSectionOptions(params.semester_id);

  const query = usePagedList(["students", "list"], listStudents, params, setParam);
  const rows = query.data?.results;

  const invalidate = [["students"], ["sections"], ["semesters"]];
  const activate = useApiMutation((s) => activateStudent(s.id), { invalidate, success: ACTIVATED });
  const deactivate = useApiMutation((s) => deactivateStudent(s.id), { invalidate, success: (s) => `${s.name} deactivated` });
  const resend = useApiMutation((s) => resendStudentCredentials(s.id), { success: "New login details have been emailed." });
  const remove = useApiMutation((s) => deleteStudent(s.id), { invalidate, success: "Student deleted" });
  const bulkActivate = useApiMutation(bulkActivateStudents, {
    invalidate,
    success: (r) => `${bulkMessage(r, "activated")}. Login details have been emailed.`,
    onSuccess: selection.clear,
  });
  const bulkDeactivate = useApiMutation(bulkDeactivateStudents, {
    invalidate,
    success: (r) => bulkMessage(r, "deactivated"),
    onSuccess: selection.clear,
  });

  const actions = (s) => (
    <RowActions
      label={`Actions for ${s.name}`}
      items={[
        { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, student: s }) },
        s.status === "ACTIVE"
          ? { label: "Deactivate", icon: Power, onSelect: () => setConfirm({ type: "deactivate", student: s }) }
          : { label: "Activate", icon: Power, onSelect: () => activate.mutate(s) },
        { label: "Resend credentials", icon: Mail, hidden: s.status !== "ACTIVE", onSelect: () => resend.mutate(s) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirm({ type: "delete", student: s }) },
      ]}
    />
  );

  const select = (s) => (
    <Checkbox checked={selection.has(s.id)} onCheckedChange={() => selection.toggle(s.id)} aria-label={`Select ${s.name}`} />
  );

  const columns = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={selection.allSelected(rows) ? true : selection.someSelected(rows) ? "indeterminate" : false}
          onCheckedChange={() => selection.toggleAll(rows)}
          aria-label="Select all on this page"
        />
      ),
      className: "w-10",
      cell: select,
    },
    { key: "roll", header: "Roll no.", cell: (s) => <span className="font-mono text-[13px] font-medium">{s.roll_number}</span> },
    {
      key: "name",
      header: "Name",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{s.name}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    { key: "sem", header: "Semester", className: "tabular-nums", cell: (s) => s.semester?.semester_number },
    { key: "section", header: "Section", cell: (s) => s.section?.name },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (s) => (
    <>
      <div className="flex items-start gap-3">
        <div className="pt-1">{select(s)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{s.name}</p>
          <p className="font-mono text-[13px] text-muted-foreground">{s.roll_number}</p>
        </div>
        {actions(s)}
      </div>
      <CardFields
        fields={[
          ["Status", <StatusBadge key="s" status={s.status} />],
          ["Semester · Section", `${s.semester?.semester_number} · ${s.section?.name}`],
        ]}
      />
    </>
  );

  // Bulk by filter: whole section or semester (API.md §12)
  const currentSection = sections.sections.find((s) => sameId(s.id, params.section_id));
  const currentSemester = semesters.options.find((s) => sameId(s.value, params.semester_id));
  const groupTarget = currentSection
    ? { body: { section_id: currentSection.id }, label: `Section ${currentSection.name}` }
    : currentSemester
      ? { body: { semester_id: apiId(currentSemester.value) }, label: currentSemester.label }
      : null;

  const cs = confirm?.student;
  const filtered = params.search || params.status || params.semester_id || params.section_id;

  return (
    <>
      <PageHeader
        title="Students"
        description="Add students to sections and activate their accounts."
        actions={
          <>
            {groupTarget && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    <Power className="size-4" /> Bulk status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>All students in {groupTarget.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => bulkActivate.mutate(groupTarget.body)}>Activate all</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirm({ type: "bulk-deactivate", ...groupTarget })}>
                    Deactivate all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <ImportButton kind="students" />
            <Button onClick={() => setForm({ open: true, student: null })}>
              <Plus className="size-4" /> New student
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search name, email, roll no…" />
        <FilterSelect
          label="Semester"
          value={params.semester_id}
          onChange={(v) => setParams({ semester_id: v, section_id: null })}
          options={semesters.options} loading={semesters.isLoading} emptyText="No semesters yet — create one under Semesters"
          allLabel="All semesters"
          className="sm:w-40"
        />
        <FilterSelect
          label="Section"
          value={params.section_id}
          onChange={(v) => setParam("section_id", v)}
          options={sections.options} loading={sections.isLoading} emptyText={params.semester_id ? "No sections in this semester yet" : "No sections yet — create one under Sections"}
          allLabel="All sections"
          className="sm:w-48"
        />
        <FilterSelect label="Status" value={params.status} onChange={(v) => setParam("status", v)} options={STATUS_OPTIONS} allLabel="All statuses" className="sm:w-36" />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <Button variant="outline" size="sm" disabled={bulkActivate.isPending} onClick={() => bulkActivate.mutate({ ids: selection.ids })}>
          <Power className="size-4" /> Activate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm({ type: "bulk-deactivate", body: { ids: selection.ids }, label: `${selection.count} selected` })}
        >
          Deactivate
        </Button>
        <BulkDeleteButton
          selection={selection}
          noun={selection.count === 1 ? "student" : "students"}
          mutationFn={bulkDeleteStudents}
          invalidate={invalidate}
          description="Their accounts are removed permanently."
        />
      </BulkBar>
      <DataView
        columns={columns}
        rows={rows}
        renderCard={renderCard}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={
          <EmptyState
            icon={Users}
            title={filtered ? "No students match" : "No students yet"}
            description={filtered ? "Try a different search or filter." : "Create semesters and sections first, then add students."}
            action={
              !filtered && (
                <Button onClick={() => setForm({ open: true, student: null })}>
                  <Plus className="size-4" /> New student
                </Button>
              )
            }
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <StudentFormDialog open={form.open} student={form.student} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <ConfirmDialog
        open={confirm?.type === "deactivate"}
        onOpenChange={() => setConfirm(null)}
        title={`Deactivate ${cs?.name}?`}
        description="They'll be signed out and won't be able to log in until reactivated."
        confirmLabel="Deactivate"
        onConfirm={() => deactivate.mutateAsync(cs)}
      />
      <ConfirmDialog
        open={confirm?.type === "bulk-deactivate"}
        onOpenChange={() => setConfirm(null)}
        title={`Deactivate students: ${confirm?.label}?`}
        description="They'll be signed out and won't be able to log in until reactivated."
        confirmLabel="Deactivate"
        onConfirm={() => bulkDeactivate.mutateAsync(confirm.body)}
      />
      <ConfirmDialog
        open={confirm?.type === "delete"}
        onOpenChange={() => setConfirm(null)}
        title={`Delete student ${cs?.name}?`}
        description="This permanently removes the account and all related data. This cannot be undone."
        confirmText={cs?.email}
        onConfirm={() => remove.mutateAsync(cs)}
      />
    </>
  );
}
