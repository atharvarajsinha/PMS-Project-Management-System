import { useState } from "react";
import { CheckCircle2, ClipboardCheck, FileText, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import SearchInput from "@/components/common/SearchInput";
import StatusBadge from "@/components/common/StatusBadge";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect } from "@/components/common/fields";
import { EvaluationStatus, EvaluatorSource } from "@/config/choices";
import { useQuery } from "@tanstack/react-query";
import MarksDialog from "@/features/evaluations/components/MarksDialog";
import SubmissionViewDialog from "@/features/evaluations/components/SubmissionViewDialog";
import { correctMarks, listEvaluations } from "@/features/evaluations/api";
import { listPhases } from "@/features/phases/api";
import { isSubmitted, offeringShort, PhaseStatus } from "@/features/teams/components/TeamBits";
import { useListParams } from "@/hooks/useListParams";
import { useFacultyOptions, useOfferingOptions, useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { idStr } from "@/lib/ids";

const STATE_OPTIONS = [
  { value: "done", label: "Evaluated" },
  { value: "todo", label: "Not evaluated yet" },
  { value: "no_evaluator", label: "Evaluator pending" },
];
const stateParams = { done: { evaluated: true }, todo: { evaluated: false }, no_evaluator: { evaluator_pending: true } };

export default function EvaluationsPage() {
  const { params, setParam, setParams } = useListParams();
  const semesters = useSemesterOptions();
  const offerings = useOfferingOptions(params.semester_id);
  const faculty = useFacultyOptions();
  const facultyOptions = faculty.options.map((o) => ({ ...o, disabled: false }));
  const phases = useQuery({
    queryKey: ["phases", "options", params.semester_subject_id],
    queryFn: () => listPhases({ semester_subject_id: params.semester_subject_id, ordering: "order", page_size: 50 }),
    enabled: !!params.semester_subject_id,
  });
  const phaseOptions = (phases.data?.results || []).map((p) => ({ value: idStr(p.id), label: `${p.order}. ${p.name}` }));
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const { state, ...rest } = params;
  const query = usePagedList(["evaluations", "list"], listEvaluations, { ...rest, ...(stateParams[state] || {}) }, setParam);
  const rows = query.data?.results;

  const evaluator = (r) =>
    r.evaluator ? (
      <span className="flex items-center gap-2">
        {r.evaluator.name}
        {r.source === EvaluatorSource.ADMIN_OVERRIDE && <StatusBadge status={r.source} group="EvaluatorSource" />}
      </span>
    ) : (
      <StatusBadge status="PENDING" label="Evaluator pending" />
    );
  const evaluated = (r) => r.evaluation?.status === EvaluationStatus.SUBMITTED;
  const buttons = (r) => (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" onClick={() => setViewing(r)} title={isSubmitted(r.submission) ? "Submitted" : "Not submitted"}>
        {isSubmitted(r.submission) ? <CheckCircle2 className="size-4 text-success" /> : <FileText className="size-4" />} Submission
      </Button>
      <Button size="sm" variant="outline" onClick={() => setEditing(r)} title={evaluated(r) ? "Evaluated" : "Not evaluated yet"}>
        {evaluated(r) ? <CheckCircle2 className="size-4 text-success" /> : <PencilLine className="size-4" />} Marks
      </Button>
    </div>
  );
  const projectTitle = (r) =>
    r.team.project_title ? (
      <span className="line-clamp-2 max-w-xs">{r.team.project_title}</span>
    ) : (
      <span className="text-muted-foreground">Not sent yet</span>
    );

  const columns = [
    {
      key: "team",
      header: "Team",
      cell: (r) => (
        <div>
          <p className="font-medium">{r.team.display_name}</p>
          <p className="text-xs text-muted-foreground">{offeringShort(r.semester_subject)}</p>
        </div>
      ),
    },
    {
      key: "phase",
      header: "Phase",
      cell: (r) => (
        <span className="flex items-center gap-2">
          {r.phase.name} <PhaseStatus status={r.phase.status} />
        </span>
      ),
    },
    { key: "project", header: "Project title", cell: projectTitle },
    { key: "evaluator", header: "Evaluator", cell: evaluator },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-60 text-right", cell: buttons },
  ];

  const renderCard = (r) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{r.team.display_name}</p>
          <p className="text-xs text-muted-foreground">
            {offeringShort(r.semester_subject)} · {r.phase.name}
          </p>
        </div>
      </div>
      <CardFields
        fields={[
          ["Project", projectTitle(r)],
          ["Evaluator", evaluator(r)],
          ["Phase", <PhaseStatus key="p" status={r.phase.status} />],
        ]}
      />
      <div className="mt-3">{buttons(r)}</div>
    </>
  );

  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Every team in every phase with its project and evaluator; open its submission or marks from the row. Marks are never shown to students. As Admin you can enter or change any marks at any time, even in locked phases."
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search team or student…" />
        <FilterSelect
          label="Semester"
          allLabel="All semesters"
          value={params.semester_id}
          options={semesters.options}
          onChange={(v) => setParams({ semester_id: v, semester_subject_id: null, phase_id: null })}
        />
        <FilterSelect
          label="Subject"
          allLabel="All subjects"
          className="sm:w-60"
          value={params.semester_subject_id}
          options={offerings.options}
          onChange={(v) => setParams({ semester_subject_id: v, phase_id: null })}
        />
        {params.semester_subject_id && (
          <FilterSelect label="Phase" allLabel="All phases" value={params.phase_id} options={phaseOptions} onChange={(v) => setParam("phase_id", v)} />
        )}
        <FilterSelect
          label="Evaluator"
          allLabel="All evaluators"
          value={params.evaluator_id}
          options={facultyOptions}
          onChange={(v) => setParam("evaluator_id", v)}
        />
        <FilterSelect label="State" allLabel="Any state" value={params.state} options={STATE_OPTIONS} onChange={(v) => setParam("state", v)} />
      </Toolbar>
      <DataView
        columns={columns}
        rows={rows}
        renderCard={renderCard}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={<EmptyState icon={ClipboardCheck} title="Nothing to show" description="Evaluations appear once a subject has phases and teams." />}
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
      <MarksDialog
        row={editing}
        onOpenChange={() => setEditing(null)}
        save={(r, body) => correctMarks(r.id, body)}
        invalidate={[["evaluations"], ["phases"]]}
        correction
      />
      <SubmissionViewDialog row={viewing} onOpenChange={() => setViewing(null)} />
    </>
  );
}
