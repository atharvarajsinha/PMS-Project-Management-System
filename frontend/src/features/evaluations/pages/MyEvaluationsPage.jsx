import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, FileText, PencilLine, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import SearchInput from "@/components/common/SearchInput";
import Toolbar from "@/components/common/Toolbar";
import { EvaluationStatus, PhaseStatus as PS } from "@/config/choices";
import MarksDialog from "@/features/evaluations/components/MarksDialog";
import SubmissionViewDialog from "@/features/evaluations/components/SubmissionViewDialog";
import { listMyEvaluationPhases, listMyEvaluations, nameTeam, saveMyMarks } from "@/features/evaluations/api";
import { dateRange, isSubmitted, PhaseStatus } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { idStr, sameId } from "@/lib/ids";
import { formatDate } from "@/lib/utils";

// "2026-11-26" + 1 day, as a date string (dates are calendar days)
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const invalidate = [["my", "evaluations"]];

function NameDialog({ row, onOpenChange }) {
  const [name, setName] = useState("");
  useEffect(() => setName(row?.team.name ?? ""), [row]);
  const mutation = useApiMutation(() => nameTeam(row.id, name), { invalidate, success: "Team name saved", onSuccess: () => onOpenChange(false) });
  return (
    <FormDialog open={!!row} onOpenChange={onOpenChange} title="Team name" description="As the team's evaluator you choose its name. Names are unique within a subject.">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="team-name">Name</Label>
          <Input id="team-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder={`Team #${row?.team.id}`} />
        </div>
        <FormActions onCancel={() => onOpenChange(false)} submitLabel="Save" pending={mutation.isPending} />
      </form>
    </FormDialog>
  );
}

export default function MyEvaluationsPage() {
  const { params, setParam } = useListParams();
  const phases = useQuery({ queryKey: ["my", "evaluations", "phases"], queryFn: listMyEvaluationPhases });
  const phaseRows = phases.data || [];
  // Default to the first phase that's ready for marks, else the first one
  const phaseId = params.phase_id || idStr((phaseRows.find((r) => r.phase.status === PS.CLOSED) || phaseRows[0])?.phase.id);
  const current = phaseRows.find((r) => sameId(r.phase.id, phaseId));
  const [editing, setEditing] = useState(null);
  const [naming, setNaming] = useState(null);
  const [viewing, setViewing] = useState(null);

  const query = usePagedList(["my", "evaluations", "list"], listMyEvaluations, { ...params, phase_id: phaseId }, setParam);
  const rows = phaseId ? query.data?.results : [];

  const evaluated = (r) => r.evaluation?.status === EvaluationStatus.SUBMITTED;
  const buttons = (r) => (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" onClick={() => setViewing(r)} title={isSubmitted(r.submission) ? "Submitted" : "Not submitted"}>
        {isSubmitted(r.submission) ? <CheckCircle2 className="size-4 text-success" /> : <FileText className="size-4" />} Submission
      </Button>
      <Button size="sm" variant={r.can_edit_marks && !r.evaluation ? "default" : "outline"} onClick={() => setEditing(r)} title={evaluated(r) ? "Evaluated" : "Not evaluated yet"}>
        {evaluated(r) ? <CheckCircle2 className="size-4 text-success" /> : <PencilLine className="size-4" />} Marks
      </Button>
    </div>
  );
  const members = (r) => r.team.members.map((m) => m.name).join(", ");
  const teamCell = (r) => (
    <div className="max-w-xs">
      <p className="flex items-center gap-1 font-medium">
        {r.team.display_name}
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setNaming(r)} title="Name team">
          <Tag className="size-3.5" />
          <span className="sr-only">Name {r.team.display_name}</span>
        </Button>
      </p>
      <p className="truncate text-xs text-muted-foreground">{members(r)}</p>
    </div>
  );
  const projectTitle = (r) =>
    r.team.project_title ? (
      <span className="line-clamp-2 max-w-sm">{r.team.project_title}</span>
    ) : (
      <span className="text-muted-foreground">Not sent yet</span>
    );

  const columns = [
    { key: "team", header: "Team", cell: teamCell },
    { key: "project", header: "Project title", cell: projectTitle },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-60 text-right", cell: buttons },
  ];

  const renderCard = (r) => (
    <>
      {teamCell(r)}
      <CardFields fields={[["Project", projectTitle(r)]]} />
      <div className="mt-3">{buttons(r)}</div>
    </>
  );

  if (phases.error) return <ErrorState error={phases.error} onRetry={phases.refetch} />;

  return (
    <>
      <PageHeader title="Evaluations" description="Teams you evaluate. Enter marks after a phase's end date, until it is locked. Students never see marks." />
      {phases.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !phaseRows.length ? (
        <div className="rounded-lg border">
          <EmptyState icon={ClipboardCheck} title="No teams to evaluate" description="Teams appear here once you are their evaluator for a phase." />
        </div>
      ) : (
        <>
          <Toolbar>
            <Select value={phaseId} onValueChange={(v) => setParam("phase_id", v)}>
              <SelectTrigger className="w-full sm:w-[30rem]" aria-label="Phase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {phaseRows.map((r) => (
                  <SelectItem key={r.phase.id} value={idStr(r.phase.id)}>
                    Sem {r.semester_subject.semester_number} · {r.semester_subject.subject_code} · {r.phase.name} ({r.evaluated}/{r.teams})
                    {r.phase.evaluation_end_date && ` · evaluate by ${formatDate(r.phase.evaluation_end_date)}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search team or student…" />
          </Toolbar>
          {current && (
            <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <PhaseStatus status={current.phase.status} />
              <span>
                <span className="text-muted-foreground">Submissions:</span> {dateRange(current.phase)}
              </span>
              <span>
                <span className="text-muted-foreground">Evaluation:</span> {formatDate(addDays(current.phase.end_date, 1))} –{" "}
                <strong className="font-semibold">{current.phase.evaluation_end_date ? formatDate(current.phase.evaluation_end_date) : "until the Admin locks it"}</strong>
              </span>
              <span>
                {Number(current.phase.max_marks) === 0 ? (
                  <span className="text-muted-foreground">No marks · tick “Evaluated”</span>
                ) : (
                  <>
                    <span className="text-muted-foreground">Out of</span> {Number(current.phase.max_marks)}
                  </>
                )}
              </span>
              <span className="text-muted-foreground">
                {current.phase.status === PS.CLOSED
                  ? "Marks can be entered now."
                  : current.phase.status === PS.LOCKED
                    ? "Locked by the Admin."
                    : "Marks open after the submission end date."}
              </span>
            </div>
          )}
          <DataView
            columns={columns}
            rows={rows}
            renderCard={renderCard}
            loading={query.isLoading}
            error={query.error}
            onRetry={query.refetch}
            empty={<EmptyState icon={ClipboardCheck} title="No teams match" />}
          />
          <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
        </>
      )}
      <MarksDialog
        row={editing}
        onOpenChange={() => setEditing(null)}
        save={(r, body) => saveMyMarks(r.id, body)}
        invalidate={invalidate}
        readOnly={!editing?.can_edit_marks}
        readOnlyReason={
          editing?.phase.status === PS.LOCKED
            ? "This phase is locked by the Admin."
            : `Marks can be entered after the submission window (${editing ? dateRange(editing.phase) : ""}) ends.`
        }
      />
      <SubmissionViewDialog row={viewing} onOpenChange={() => setViewing(null)} />
      <NameDialog row={naming} onOpenChange={() => setNaming(null)} />
    </>
  );
}
