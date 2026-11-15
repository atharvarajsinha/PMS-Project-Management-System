import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, PencilLine, Tag } from "lucide-react";
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
import { PhaseStatus as PS } from "@/config/choices";
import MarksDialog, { MarksCell } from "@/features/evaluations/components/MarksDialog";
import { listMyEvaluationPhases, listMyEvaluations, nameTeam, saveMyMarks } from "@/features/evaluations/api";
import { dateRange, LinkList, PhaseStatus, SubmissionState } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { idStr, sameId } from "@/lib/ids";

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

  const query = usePagedList(["my", "evaluations", "list"], listMyEvaluations, { ...params, phase_id: phaseId }, setParam);
  const rows = phaseId ? query.data?.results : [];

  const buttons = (r) => (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" onClick={() => setNaming(r)} title="Name team">
        <Tag className="size-4" /> <span className="sr-only lg:not-sr-only">Name</span>
      </Button>
      <Button size="sm" variant={r.evaluation ? "ghost" : "outline"} onClick={() => setEditing(r)} disabled={!r.can_edit_marks}>
        <PencilLine className="size-4" /> {r.evaluation ? "Edit" : "Marks"}
      </Button>
    </div>
  );
  const members = (r) => r.team.members.map((m) => m.name).join(", ");

  const columns = [
    {
      key: "team",
      header: "Team",
      cell: (r) => (
        <div className="max-w-xs">
          <p className="font-medium">{r.team.display_name}</p>
          <p className="truncate text-xs text-muted-foreground">{members(r)}</p>
        </div>
      ),
    },
    {
      key: "submission",
      header: "Submission",
      cell: (r) => (
        <div className="space-y-1">
          <SubmissionState submission={r.submission} />
          {r.submission && <LinkList links={r.submission.links} />}
        </div>
      ),
    },
    { key: "marks", header: "Marks", cell: (r) => <MarksCell row={r} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-44 text-right", cell: buttons },
  ];

  const renderCard = (r) => (
    <>
      <p className="font-medium">{r.team.display_name}</p>
      <p className="text-xs text-muted-foreground">{members(r)}</p>
      <CardFields fields={[["Submission", <SubmissionState key="s" submission={r.submission} />], ["Marks", <MarksCell key="m" row={r} />]]} />
      {r.submission && <LinkList className="mt-2" links={r.submission.links} />}
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
              <SelectTrigger className="w-full sm:w-80" aria-label="Phase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {phaseRows.map((r) => (
                  <SelectItem key={r.phase.id} value={idStr(r.phase.id)}>
                    Sem {r.semester_subject.semester_number} · {r.semester_subject.subject_code} · {r.phase.name} ({r.evaluated}/{r.teams})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search team or student…" />
          </Toolbar>
          {current && (
            <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <PhaseStatus status={current.phase.status} />
              Submissions {dateRange(current.phase)} · out of {Number(current.phase.max_marks)} ·{" "}
              {current.phase.status === PS.CLOSED
                ? "marks can be entered now"
                : current.phase.status === PS.LOCKED
                  ? "locked by the Admin"
                  : "marks open after the end date"}
            </p>
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
      <MarksDialog row={editing} onOpenChange={() => setEditing(null)} save={(r, body) => saveMyMarks(r.id, body)} invalidate={invalidate} />
      <NameDialog row={naming} onOpenChange={() => setNaming(null)} />
    </>
  );
}
