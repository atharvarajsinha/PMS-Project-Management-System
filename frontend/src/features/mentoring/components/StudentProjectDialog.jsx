import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/common/ErrorState";
import FormDialog from "@/components/common/FormDialog";
import StatusBadge from "@/components/common/StatusBadge";
import { EvaluationStatus, MentorStatus, TeamRole } from "@/config/choices";
import { getClassStudentProject } from "@/features/mentoring/api";
import { PhaseStatus, PhaseWindows } from "@/features/teams/components/TeamBits";

function Marks({ phase }) {
  if (phase.marks === null || phase.marks === undefined) return <span className="text-muted-foreground">Not marked yet</span>;
  return (
    <span className="flex items-center gap-2 tabular-nums">
      <span className="font-semibold">
        {Number(phase.marks)} / {Number(phase.max_marks)}
      </span>
      {phase.evaluation_status !== EvaluationStatus.SUBMITTED && <StatusBadge status="DRAFT" label="Draft" />}
    </span>
  );
}

function SubjectBlock({ item }) {
  const { semester_subject: o, team, phases, totals } = item;
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {o.subject.code} — {o.subject.name}
          </h3>
          {team ? (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {team.role === TeamRole.LEAD && <Crown className="size-3.5 text-primary" aria-label="Team Lead" />}
              {team.display_name} · {team.members.join(", ")}
            </p>
          ) : (
            <StatusBadge status="PENDING" label="No team" />
          )}
          {team && (
            <p className="text-xs">
              <span className="text-muted-foreground">Mentor: </span>
              {team.mentors.length
                ? team.mentors.map((m) => `${m.name}${m.status === MentorStatus.PENDING ? " (pending)" : ""}`).join(", ")
                : "—"}
            </p>
          )}
        </div>
        {totals && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total so far</p>
            <p className="text-lg font-semibold tabular-nums">
              {Number(totals.marks)} / {Number(totals.max_marks)}
            </p>
          </div>
        )}
      </div>
      {phases.length ? (
        <ul className="divide-y rounded-md border">
          {phases.map((p) => (
            <li key={p.id} className="space-y-2 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  {p.name} <PhaseStatus status={p.status} />
                </span>
                {team && <Marks phase={p} />}
              </div>
              <PhaseWindows phase={p} showProgress={!!team} />
              {team && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Evaluated by: </span>
                  {p.evaluator?.name || <span className="text-warning">evaluator pending</span>}
                </p>
              )}
              {p.remarks && <p className="whitespace-pre-wrap text-xs text-muted-foreground">Remarks: {p.remarks}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No phases yet.</p>
      )}
    </section>
  );
}

/** Class teacher: one student's teams, evaluators and marks for every phase of every subject. */
export default function StudentProjectDialog({ sectionId, student, onOpenChange }) {
  const query = useQuery({
    queryKey: ["my", "class-student-project", sectionId, student?.id],
    queryFn: () => getClassStudentProject(sectionId, student.id),
    enabled: !!student,
  });
  return (
    <FormDialog
      open={!!student}
      onOpenChange={onOpenChange}
      title={student ? `${student.name} · ${student.roll_number}` : "Student"}
      description="Teams, evaluators and marks for every phase. Marks are visible to you as class teacher, not to students."
      className="sm:max-w-3xl"
    >
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.isLoading && <Skeleton className="h-60 w-full" />}
      {query.data && (
        <div className="space-y-4">
          {query.data.subjects.map((item) => (
            <SubjectBlock key={item.semester_subject.id} item={item} />
          ))}
          {!query.data.subjects.length && <p className="text-sm text-muted-foreground">This section takes no subjects yet.</p>}
        </div>
      )}
    </FormDialog>
  );
}
