import { useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BulkBar from "@/components/common/BulkBar";
import BulkDeleteButton, { selectColumn } from "@/components/common/BulkDeleteButton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import SearchInput from "@/components/common/SearchInput";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect } from "@/components/common/fields";
import { optionsOf, PhaseStatus as PS } from "@/config/choices";
import PhaseFormDialog from "@/features/phases/components/PhaseFormDialog";
import { bulkDeletePhases, deletePhase, listPhases, lockPhase, phasesInvalidate, reorderPhases, unlockPhase } from "@/features/phases/api";
import { dateRange, PhaseStatus, ProjectPhaseBadge } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useOfferingOptions, useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { formatDate } from "@/lib/utils";

const subjectLabel = (p) => `Sem ${p.semester_subject.semester.semester_number} · ${p.semester_subject.subject.code}`;

function Progress({ stats }) {
  if (!stats) return "—";
  return (
    <span className="flex flex-col text-sm leading-snug tabular-nums">
      <span className="whitespace-nowrap">{stats.submitted_count}/{stats.teams_count} submitted</span>
      <span className="whitespace-nowrap text-xs text-muted-foreground">{stats.evaluated_count} evaluated</span>
      {stats.evaluator_pending_count > 0 && <span className="text-warning"> · {stats.evaluator_pending_count} without evaluator</span>}
    </span>
  );
}

export default function PhasesPage() {
  const { params, setParam, setParams } = useListParams({ page_size: 50 });
  const [form, setForm] = useState({ open: false, phase: null });
  const [confirm, setConfirm] = useState(null); // { type: "delete" | "unlock", phase }
  const semesters = useSemesterOptions();
  const offerings = useOfferingOptions(params.semester_id);
  const selection = useSelection();

  const query = usePagedList(["phases", "list"], listPhases, params, setParam);
  const rows = query.data?.results;

  const remove = useApiMutation((p) => deletePhase(p.id), { invalidate: phasesInvalidate, success: "Phase deleted" });
  const lock = useApiMutation((p) => lockPhase(p.id), { invalidate: phasesInvalidate, success: (p) => `${p.name} locked. Marks can no longer change.` });
  const unlock = useApiMutation((p) => unlockPhase(p.id), { invalidate: phasesInvalidate, success: (p) => `${p.name} unlocked for corrections` });
  const reorder = useApiMutation(({ offeringId, ids }) => reorderPhases(offeringId, ids), { invalidate: [["phases"]] });

  // Move within its own subject: needs the subject's full order
  const move = async (phase, delta) => {
    const all = await listPhases({ semester_subject_id: phase.semester_subject_id, ordering: "order", page_size: 50 });
    const ids = all.results.map((p) => p.id);
    const i = ids.indexOf(phase.id);
    const j = i + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate({ offeringId: phase.semester_subject_id, ids });
  };

  const select = selectColumn(selection, rows, (p) => p.name);

  const actions = (p) => (
    <RowActions
      label={`Actions for ${p.name}`}
      items={[
        { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, phase: p }) },
        { label: "Move up", icon: ArrowUp, onSelect: () => move(p, -1) },
        { label: "Move down", icon: ArrowDown, onSelect: () => move(p, 1) },
        { label: "Lock evaluation", icon: Lock, hidden: p.status !== PS.CLOSED, onSelect: () => lock.mutate(p) },
        { label: "Unlock for corrections", icon: LockOpen, hidden: p.status !== PS.LOCKED, onSelect: () => setConfirm({ type: "unlock", phase: p }) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirm({ type: "delete", phase: p }) },
      ]}
    />
  );

  const columns = [
    select,
    { key: "subject", header: "Subject", cell: (p) => <span className="whitespace-nowrap">{subjectLabel(p)}</span> },
    {
      key: "name",
      header: "Phase",
      cell: (p) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span>
              <span className="text-muted-foreground tabular-nums">{p.order}.</span> {p.name}
            </span>
            {p.is_project_phase && <ProjectPhaseBadge />}
          </p>
          {p.short_description && <p className="truncate text-xs text-muted-foreground">{p.short_description}</p>}
          {!!p.criteria?.length && (
            <p className="truncate text-xs text-muted-foreground" title={p.criteria.map((c) => c.name).join(", ")}>
              {p.criteria.length} {p.criteria.length === 1 ? "criterion" : "criteria"}: {p.criteria.map((c) => c.name).join(", ")}
            </p>
          )}
        </div>
      ),
    },
    { key: "dates", header: "Submissions", cell: (p) => <span className="whitespace-nowrap">{dateRange(p)}</span> },
    { key: "eval", header: "Evaluation ends", cell: (p) => (p.evaluation_end_date ? formatDate(p.evaluation_end_date) : "When locked") },
    { key: "marks", header: "Max", className: "tabular-nums", cell: (p) => Number(p.max_marks) },
    { key: "status", header: "Status", cell: (p) => <PhaseStatus status={p.status} /> },
    { key: "progress", header: "Progress", cell: (p) => <Progress stats={p.stats} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (p) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          {select.cell(p)}
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {p.order}. {p.name} {p.is_project_phase && <ProjectPhaseBadge />}
            </p>
            <p className="text-xs text-muted-foreground">{subjectLabel(p)}</p>
          </div>
        </div>
        {actions(p)}
      </div>
      <CardFields
        fields={[
          ["Status", <PhaseStatus key="s" status={p.status} />],
          ["Max marks", Number(p.max_marks)],
          ["Submissions", dateRange(p)],
          ["Evaluation ends", p.evaluation_end_date ? formatDate(p.evaluation_end_date) : "When locked"],
        ]}
      />
      <div className="mt-2">
        <Progress stats={p.stats} />
      </div>
    </>
  );

  const newButton = (
    <Button onClick={() => setForm({ open: true, phase: null })}>
      <Plus className="size-4" /> New phase
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Phases"
        description="Project phases per subject. Submissions close after the end date; evaluation closes when the phase is locked."
        actions={newButton}
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search phases…" />
        <FilterSelect
          label="Semester"
          allLabel="All semesters"
          value={params.semester_id}
          options={semesters.options}
          onChange={(v) => setParams({ semester_id: v, semester_subject_id: null })}
        />
        <FilterSelect
          label="Subject"
          allLabel="All subjects"
          className="sm:w-60"
          value={params.semester_subject_id}
          options={offerings.options}
          onChange={(v) => setParam("semester_subject_id", v)}
        />
        <FilterSelect label="Status" allLabel="Any status" value={params.status} options={optionsOf("PhaseStatus")} onChange={(v) => setParam("status", v)} />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BulkDeleteButton
          selection={selection}
          noun={selection.count === 1 ? "phase" : "phases"}
          mutationFn={bulkDeletePhases}
          invalidate={phasesInvalidate}
          description="Their submissions, evaluator assignments and marks are deleted too."
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
            icon={CalendarClock}
            title={params.search || params.status || params.semester_subject_id ? "No phases match" : "No phases yet"}
            description="Each subject offering has its own phases, e.g. Proposal → Design → Final demo."
            action={newButton}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <PhaseFormDialog
        open={form.open}
        phase={form.phase}
        defaultOfferingId={params.semester_subject_id}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
      />
      <ConfirmDialog
        open={confirm?.type === "delete"}
        onOpenChange={() => setConfirm(null)}
        title={`Delete ${confirm?.phase?.name}?`}
        description="All submissions, evaluator assignments and marks of this phase are deleted. This cannot be undone."
        confirmText={confirm?.phase?.name}
        onConfirm={() => remove.mutateAsync(confirm.phase)}
      />
      <ConfirmDialog
        open={confirm?.type === "unlock"}
        onOpenChange={() => setConfirm(null)}
        title={`Unlock ${confirm?.phase?.name}?`}
        description="Evaluators can change marks again until you lock it. It won't lock automatically again."
        confirmLabel="Unlock"
        destructive={false}
        onConfirm={() => unlock.mutateAsync(confirm.phase)}
      />
    </>
  );
}
