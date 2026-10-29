import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Mail, Pencil, Plus, Power, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import BulkBar from "@/components/common/BulkBar";
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
import ClassStudentFormDialog from "@/features/faculty-portal/components/ClassStudentFormDialog";
import { BackLink, PortalLoadError, sectionLabel } from "@/features/faculty-portal/components/PortalBits";
import {
  activateClassStudent,
  bulkActivateClassStudents,
  bulkDeactivateClassStudents,
  deactivateClassStudent,
  getClassSection,
  listClassStudents,
  resendClassStudentCredentials,
} from "@/features/faculty-portal/api";
import { bulkMessage, useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";

const ORDERING_OPTIONS = [
  { value: "name", label: "Sort by name" },
  { value: "-created_at", label: "Newest first" },
];

// Class teacher: their section's students. No delete or section moves (College Admin only).
export default function ClassSectionPage() {
  const { sectionId } = useParams();
  const { params, setParam } = useListParams({ ordering: "roll_number" });
  const [form, setForm] = useState({ open: false, student: null });
  const [confirm, setConfirm] = useState(null); // { type, student?, ids?, label? }
  const selection = useSelection();

  const section = useQuery({ queryKey: ["my", "class-sections", sectionId], queryFn: () => getClassSection(sectionId) });
  const query = usePagedList(
    ["my", "class-students", sectionId],
    (p) => listClassStudents(sectionId, p),
    params,
    setParam,
  );
  const rows = query.data?.results;
  const s = section.data;

  const invalidate = [["my"]];
  const activate = useApiMutation((st) => activateClassStudent(sectionId, st.id), {
    invalidate,
    success: "Account activated. Login details have been emailed.",
  });
  const deactivate = useApiMutation((st) => deactivateClassStudent(sectionId, st.id), {
    invalidate,
    success: (st) => `${st.name} deactivated`,
  });
  const resend = useApiMutation((st) => resendClassStudentCredentials(sectionId, st.id), {
    success: "New login details have been emailed.",
  });
  const bulkActivate = useApiMutation((ids) => bulkActivateClassStudents(sectionId, ids), {
    invalidate,
    success: (r) => `${bulkMessage(r, "activated")}. Login details have been emailed.`,
    onSuccess: selection.clear,
  });
  const bulkDeactivate = useApiMutation((ids) => bulkDeactivateClassStudents(sectionId, ids), {
    invalidate,
    success: (r) => bulkMessage(r, "deactivated"),
    onSuccess: selection.clear,
  });

  if (section.error) {
    return (
      <>
        <BackLink />
        <PortalLoadError error={section.error} onRetry={section.refetch} what="Class section" />
      </>
    );
  }

  const actions = (st) => (
    <RowActions
      label={`Actions for ${st.name}`}
      items={[
        { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, student: st }) },
        st.status === "ACTIVE"
          ? { label: "Deactivate", icon: Power, onSelect: () => setConfirm({ type: "deactivate", student: st }) }
          : { label: "Activate", icon: Power, onSelect: () => activate.mutate(st) },
        { label: "Resend credentials", icon: Mail, hidden: st.status !== "ACTIVE", onSelect: () => resend.mutate(st) },
      ]}
    />
  );

  const select = (st) => (
    <Checkbox checked={selection.has(st.id)} onCheckedChange={() => selection.toggle(st.id)} aria-label={`Select ${st.name}`} />
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
    { key: "roll", header: "Roll no.", cell: (st) => <span className="font-mono text-[13px] font-medium">{st.roll_number}</span> },
    {
      key: "name",
      header: "Name",
      cell: (st) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{st.name}</p>
          <p className="truncate text-xs text-muted-foreground">{st.email}</p>
        </div>
      ),
    },
    { key: "phone", header: "Phone", className: "tabular-nums", cell: (st) => st.phone || <span className="text-muted-foreground">—</span> },
    { key: "status", header: "Status", cell: (st) => <StatusBadge status={st.status} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (st) => (
    <>
      <div className="flex items-start gap-3">
        <div className="pt-1">{select(st)}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{st.name}</p>
          <p className="font-mono text-[13px] text-muted-foreground">{st.roll_number}</p>
        </div>
        {actions(st)}
      </div>
      <CardFields
        fields={[
          ["Status", <StatusBadge key="s" status={st.status} />],
          ["Email", st.email],
        ]}
      />
    </>
  );

  const filtered = params.search || params.status;
  const cs = confirm?.student;
  const openAdd = () => setForm({ open: true, student: null });

  return (
    <>
      <BackLink />
      <PageHeader
        title={s ? sectionLabel(s.semester.semester_number, s.name) : "Class section"}
        description="You're the class teacher. Add your students, keep their details up to date and activate their accounts."
        actions={
          <Button onClick={openAdd} disabled={!s}>
            <Plus className="size-4" /> Add student
          </Button>
        }
      />

      {section.isLoading && <Skeleton className="mb-6 h-24 w-full" />}
      {s && (
        <section className="mb-6 grid gap-4 md:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Students</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.students_count}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-xs text-muted-foreground">Subjects in this section</p>
            {s.subjects.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {s.subjects.map((sub) => (
                  <li key={sub.section_subject_id} className="rounded-md border px-2.5 py-1 text-xs">
                    <span className="font-mono font-medium">{sub.subject_code}</span>{" "}
                    <span className="text-muted-foreground">{sub.faculty ? sub.faculty.name : "No faculty yet"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                <BookOpen className="size-4" aria-hidden /> No subjects mapped yet.
              </p>
            )}
          </div>
        </section>
      )}

      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search name, email, roll no…" />
        <FilterSelect label="Status" value={params.status} onChange={(v) => setParam("status", v)} options={STATUS_OPTIONS} allLabel="All statuses" className="sm:w-36" />
        <FilterSelect
          label="Sort"
          value={params.ordering === "roll_number" ? null : params.ordering}
          onChange={(v) => setParam("ordering", v)}
          options={ORDERING_OPTIONS}
          allLabel="Sort by roll no."
          className="sm:w-40"
        />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <Button variant="outline" size="sm" disabled={bulkActivate.isPending} onClick={() => bulkActivate.mutate(selection.ids)}>
          <Power className="size-4" /> Activate
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirm({ type: "bulk-deactivate", ids: selection.ids, label: `${selection.count} selected` })}
        >
          Deactivate
        </Button>
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
            title={filtered ? "No students match" : "No students in this section yet"}
            description={filtered ? "Try a different search or filter." : "Add your students, then activate them to email their login details."}
            action={
              !filtered && (
                <Button onClick={openAdd}>
                  <Plus className="size-4" /> Add student
                </Button>
              )
            }
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
      <p className="mt-4 text-xs text-muted-foreground">
        To remove a student or move them to another section, contact your College Admin.
      </p>

      <ClassStudentFormDialog
        open={form.open}
        section={s}
        student={form.student}
        onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
      />
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
        onConfirm={() => bulkDeactivate.mutateAsync(confirm.ids)}
      />
    </>
  );
}
