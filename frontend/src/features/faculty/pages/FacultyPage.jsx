import { Link } from "react-router-dom";
import { useState } from "react";
import { Eye, GraduationCap, Mail, Pencil, Plus, Power, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import FacultyDetailSheet from "@/features/faculty/components/FacultyDetailSheet";
import FacultyFormDialog from "@/features/faculty/components/FacultyFormDialog";
import SpecializationsDialog from "@/features/faculty/components/SpecializationsDialog";
import { useSpecializationOptions } from "@/features/specializations/api";
import {
  activateFaculty,
  bulkActivateFaculty,
  bulkDeleteFaculty,
  bulkDeactivateFaculty,
  deactivateFaculty,
  deleteFaculty,
  listFaculty,
  resendFacultyCredentials,
} from "@/features/faculty/api";
import { bulkMessage, useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { formatDateTime } from "@/lib/utils";

const ACTIVATED = "Account activated. Login details have been emailed.";
const ORDERING = [
  { value: "-created_at", label: "Newest first" },
  { value: "-last_login_at", label: "Recent login" },
];

export default function FacultyPage() {
  const { params, setParam } = useListParams({ ordering: "name" });
  const [form, setForm] = useState({ open: false, faculty: null });
  const [detailId, setDetailId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type, faculty }
  const [specsOpen, setSpecsOpen] = useState(false);
  const selection = useSelection();
  const specs = useSpecializationOptions();

  const query = usePagedList(["faculty", "list"], listFaculty, params, setParam);
  const rows = query.data?.results;

  const invalidate = [["faculty"], ["sections"], ["section-subjects"]];
  const activate = useApiMutation((f) => activateFaculty(f.id), { invalidate, success: ACTIVATED });
  const deactivate = useApiMutation((f) => deactivateFaculty(f.id), { invalidate, success: (f) => `${f.name} deactivated` });
  const resend = useApiMutation((f) => resendFacultyCredentials(f.id), { success: "New login details have been emailed." });
  const remove = useApiMutation((f) => deleteFaculty(f.id), { invalidate, success: "Faculty deleted" });
  const bulkActivate = useApiMutation(bulkActivateFaculty, {
    invalidate,
    success: (r) => `${bulkMessage(r, "activated")}. Login details have been emailed.`,
    onSuccess: selection.clear,
  });
  const bulkDeactivate = useApiMutation(bulkDeactivateFaculty, {
    invalidate,
    success: (r) => bulkMessage(r, "deactivated"),
    onSuccess: selection.clear,
  });

  const actions = (f) => (
    <RowActions
      label={`Actions for ${f.name}`}
      items={[
        { label: "View details", icon: Eye, onSelect: () => setDetailId(f.id) },
        { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, faculty: f }) },
        f.status === "ACTIVE"
          ? { label: "Deactivate", icon: Power, onSelect: () => setConfirm({ type: "deactivate", faculty: f }) }
          : { label: "Activate", icon: Power, onSelect: () => activate.mutate(f) },
        { label: "Resend credentials", icon: Mail, hidden: f.status !== "ACTIVE", onSelect: () => resend.mutate(f) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirm({ type: "delete", faculty: f }) },
      ]}
    />
  );

  const select = (f) => (
    <Checkbox checked={selection.has(f.id)} onCheckedChange={() => selection.toggle(f.id)} aria-label={`Select ${f.name}`} />
  );

  const classTeacher = (f) =>
    f.class_teacher_of.length
      ? f.class_teacher_of.map((c) => `S${c.semester_number}-${c.section_name}`).join(", ")
      : "—";

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
    {
      key: "name",
      header: "Name",
      cell: (f) => (
        <button type="button" className="min-w-0 text-left" onClick={() => setDetailId(f.id)}>
          <p className="truncate font-medium hover:underline">{f.name}</p>
          <p className="truncate text-xs text-muted-foreground">{[f.designation, f.email].filter(Boolean).join(" · ")}</p>
        </button>
      ),
    },
    { key: "specs", header: "Specializations", cell: (f) => specList(f) },
    { key: "phone", header: "Phone", cell: (f) => f.phone || "—" },
    { key: "ct", header: "Class coordinator", cell: classTeacher },
    { key: "teaching", header: "Subjects", className: "tabular-nums", cell: (f) => f.teaching_count },
    { key: "evaluating", header: "Evaluating", className: "tabular-nums", cell: (f) => evaluating(f) },
    { key: "status", header: "Status", cell: (f) => <StatusBadge status={f.status} /> },
    { key: "login", header: "Last login", cell: (f) => <span className="text-xs">{formatDateTime(f.last_login_at)}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const specList = (f) =>
    f.specializations?.length ? (
      <span className="line-clamp-2 text-sm">{f.specializations.map((s) => s.name).join(", ")}</span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );

  // Teams this faculty member evaluates (any phase); opens Evaluations filtered to them
  const evaluating = (f) =>
    f.evaluation_teams_count ? (
      <Link to={`/admin/evaluations?evaluator_id=${f.id}`} className="text-primary underline-offset-4 hover:underline" title="Open their evaluations">
        {f.evaluation_teams_count} {f.evaluation_teams_count === 1 ? "team" : "teams"}
      </Link>
    ) : (
      <span className="text-muted-foreground">0 teams</span>
    );

  const renderCard = (f) => (
    <>
      <div className="flex items-start gap-3">
        <div className="pt-1">{select(f)}</div>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailId(f.id)}>
          <p className="truncate font-medium">{f.name}</p>
          <p className="truncate text-xs text-muted-foreground">{f.email}</p>
        </button>
        {actions(f)}
      </div>
      <CardFields
        fields={[
          ["Status", <StatusBadge key="s" status={f.status} />],
          ["Specializations", specList(f)],
          ["Subjects", f.teaching_count],
          ["Evaluating", evaluating(f)],
          ["Class coordinator", classTeacher(f)],
        ]}
      />
    </>
  );

  const cf = confirm?.faculty;
  const filtered = params.search || params.status || params.specialization_id;

  return (
    <>
      <PageHeader
        title="Faculty"
        description="Add faculty, activate their accounts and see what they teach."
        actions={
          <>
            <Button variant="outline" onClick={() => setSpecsOpen(true)}>
              <Tags className="size-4" /> Specializations
            </Button>
            <ImportButton kind="faculty" />
            <Button onClick={() => setForm({ open: true, faculty: null })}>
              <Plus className="size-4" /> New faculty
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search name or email…" />
        <FilterSelect label="Status" value={params.status} onChange={(v) => setParam("status", v)} options={STATUS_OPTIONS} allLabel="All statuses" />
        <FilterSelect
          label="Specialization"
          value={params.specialization_id}
          onChange={(v) => setParam("specialization_id", v)}
          options={specs.options}
          loading={specs.isLoading}
          emptyText="No specializations yet."
          allLabel="Any specialization"
        />
        <FilterSelect label="Sort" value={params.ordering === "name" ? "all" : params.ordering} onChange={(v) => setParam("ordering", v)} options={ORDERING} allLabel="Name A–Z" />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <Button variant="outline" size="sm" disabled={bulkActivate.isPending} onClick={() => bulkActivate.mutate(selection.ids)}>
          <Power className="size-4" /> Activate
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirm({ type: "bulk-deactivate" })}>
          Deactivate
        </Button>
        <BulkDeleteButton
          selection={selection}
          noun="faculty"
          mutationFn={bulkDeleteFaculty}
          invalidate={invalidate}
          description="Their accounts are removed permanently; their class coordinator roles and subject assignments become unassigned."
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
            icon={GraduationCap}
            title={filtered ? "No faculty match" : "No faculty yet"}
            description={filtered ? "Try a different search or filter." : "Add faculty members to assign them to sections and subjects."}
            action={
              !filtered && (
                <Button onClick={() => setForm({ open: true, faculty: null })}>
                  <Plus className="size-4" /> New faculty
                </Button>
              )
            }
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <FacultyFormDialog open={form.open} faculty={form.faculty} onOpenChange={(open) => setForm((s) => ({ ...s, open }))} />
      <SpecializationsDialog open={specsOpen} onOpenChange={setSpecsOpen} />
      <FacultyDetailSheet facultyId={detailId} onOpenChange={(open) => !open && setDetailId(null)} />
      <ConfirmDialog
        open={confirm?.type === "deactivate"}
        onOpenChange={() => setConfirm(null)}
        title={`Deactivate ${cf?.name}?`}
        description="They'll be signed out and won't be able to log in until reactivated. Their assignments are kept."
        confirmLabel="Deactivate"
        onConfirm={() => deactivate.mutateAsync(cf)}
      />
      <ConfirmDialog
        open={confirm?.type === "bulk-deactivate"}
        onOpenChange={() => setConfirm(null)}
        title={`Deactivate ${selection.count} faculty?`}
        description="They'll be signed out and won't be able to log in until reactivated."
        confirmLabel="Deactivate"
        onConfirm={() => bulkDeactivate.mutateAsync(selection.ids)}
      />
      <ConfirmDialog
        open={confirm?.type === "delete"}
        onOpenChange={() => setConfirm(null)}
        title={`Delete faculty ${cf?.name}?`}
        description="This permanently removes the account. Their class coordinator roles and subject assignments become unassigned. This cannot be undone."
        confirmText={cf?.email}
        onConfirm={() => remove.mutateAsync(cf)}
      />
    </>
  );
}
