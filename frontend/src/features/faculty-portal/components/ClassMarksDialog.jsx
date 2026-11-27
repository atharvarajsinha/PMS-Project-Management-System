import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import Carousel from "@/components/common/Carousel";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import FormDialog from "@/components/common/FormDialog";
import { EvaluationStatus } from "@/config/choices";
import { sectionLabel } from "@/features/faculty-portal/components/PortalBits";
import { getClassSectionMarks } from "@/features/mentoring/api";
import { PhaseStatus } from "@/features/teams/components/TeamBits";

const n = (v) => Number(v);

/** One subject: a row per student, a column per phase, then the total. */
function SubjectMarks({ subject, students }) {
  const ssId = String(subject.semester_subject.id);
  if (!subject.phases.length) return <p className="py-6 text-center text-sm text-muted-foreground">No phases for this subject yet.</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted px-3 py-2 font-medium">Student</th>
            {subject.phases.map((p) => (
              <th key={p.id} className="px-3 py-2 text-right font-medium">
                <span className="block text-foreground">
                  {p.order}. {p.name}
                </span>
                <span className="flex items-center justify-end gap-1.5 font-normal">
                  out of {n(p.max_marks)} <PhaseStatus status={p.status} />
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium">
              <span className="block text-foreground">Total</span>
              <span className="font-normal">out of {n(subject.total_max_marks)}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {students.map((row) => {
            const cell = row.subjects[ssId];
            return (
              <tr key={row.student.id}>
                <td className="sticky left-0 z-10 bg-background px-3 py-2">
                  <p className="font-medium">{row.student.name}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{row.student.roll_number}</span> · {cell?.team ? cell.team.display_name : "No team"}
                  </p>
                </td>
                {subject.phases.map((p) => {
                  const m = cell?.marks[String(p.id)];
                  return (
                    <td key={p.id} className="px-3 py-2 text-right tabular-nums">
                      {m ? (
                        <span className={m.status === EvaluationStatus.SUBMITTED ? undefined : "text-muted-foreground"} title={m.status === EvaluationStatus.SUBMITTED ? undefined : "Draft: the evaluator may still change it"}>
                          {n(m.marks)}
                          {m.status !== EvaluationStatus.SUBMITTED && <sup className="ml-0.5">*</sup>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{cell?.total !== null && cell?.total !== undefined ? n(cell.total) : <span className="font-normal text-muted-foreground">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Class teacher: marks of every student of the section, subject by subject, one column per phase. */
export default function ClassMarksDialog({ sectionId, semesterNumber, sectionName, open, onOpenChange }) {
  const [index, setIndex] = useState(0);
  const query = useQuery({ queryKey: ["my", "class-sections", sectionId, "marks"], queryFn: () => getClassSectionMarks(sectionId), enabled: open });
  const d = query.data;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Marks · ${sectionLabel(semesterNumber, sectionName)}`}
      description="Each student's marks per phase. — means not evaluated yet; * marks a draft the evaluator may still change. Students never see marks."
      className="sm:max-w-5xl"
    >
      <div className="min-w-0">
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading || !d ? (
        <Skeleton className="h-64 w-full" />
      ) : !d.subjects.length || !d.students.length ? (
        <EmptyState title="Nothing to show" description={!d.students.length ? "This section has no students yet." : "This section has no subjects yet."} />
      ) : (
        <Carousel
          label="Subjects"
          size="sm"
          items={d.subjects}
          index={index}
          onIndexChange={setIndex}
          itemKey={(s) => s.semester_subject.id}
          tabLabel={(s) => (
            <span className="whitespace-nowrap">
              <span className="font-medium">{s.semester_subject.subject.code}</span>{" "}
              <span className="text-muted-foreground">{s.semester_subject.subject.name}</span>
            </span>
          )}
          renderItem={(s) => <SubjectMarks subject={s} students={d.students} />}
        />
      )}
      </div>
    </FormDialog>
  );
}
