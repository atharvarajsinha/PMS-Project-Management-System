import { useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import PasswordInput from "@/components/common/PasswordInput";
import StatusBadge from "@/components/common/StatusBadge";
import { EvaluationStatus } from "@/config/choices";
import { isSubmitted } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { formatDate } from "@/lib/utils";

// Marks inputs are masked like passwords (frontend only) so marks aren't read off the screen.
// Only digits and one decimal point are accepted; password managers are told to ignore them.
function MarksInput({ value, onChange, className, ...props }) {
  return (
    <PasswordInput
      revealLabel="marks"
      inputMode="decimal"
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.]/g, "");
        if (/^\d*\.?\d{0,2}$/.test(v)) onChange(v);
      }}
      className={className}
      {...props}
    />
  );
}

const num = (v) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

/** "15 / 20" when everyone got the same, else "12–18 / 20 (avg 15)". */
export function MarksCell({ row }) {
  const e = row.evaluation;
  if (!e?.summary) return <span className="text-muted-foreground">—</span>;
  if (Number(e.max_marks) === 0) {
    return e.status === EvaluationStatus.SUBMITTED ? (
      <span className="text-sm">Evaluated</span>
    ) : (
      <StatusBadge status={e.status} group="EvaluationStatus" />
    );
  }
  const { min, max, avg } = e.summary;
  const same = Number(min) === Number(max);
  return (
    <span className="flex flex-wrap items-center gap-2 tabular-nums">
      {same ? Number(min) : `${Number(min)}–${Number(max)}`} / {Number(e.max_marks)}
      {!same && <span className="text-xs text-muted-foreground">avg {Number(avg)}</span>}
      {e.status !== EvaluationStatus.SUBMITTED && <StatusBadge status={e.status} group="EvaluationStatus" />}
    </span>
  );
}

/**
 * Enter (evaluator) or correct (Admin) marks for one team in one phase.
 * Marks are per student: "Marks for everyone" fills every member, then any member can be changed.
 * `save(row, body)` is the API call; rows come from /my/evaluations/ or /evaluations/.
 * `readOnly` shows the marks without inputs that can change them (e.g. phase locked or not closed yet).
 * The submission itself is in SubmissionViewDialog; this dialog only has marks.
 */
export default function MarksDialog({ row, onOpenChange, save, invalidate, correction = false, readOnly = false, readOnlyReason }) {
  const [master, setMaster] = useState("");
  const [perStudent, setPerStudent] = useState({}); // { studentId: "12.5" }
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState(null);
  const submitted = isSubmitted(row?.submission);
  // The Admin (correction) overrides: marks may be given even without a submission
  const locked = readOnly || (!submitted && !correction);
  const max = Number(row?.max_marks ?? 0);
  const members = row?.team.members || [];
  // A phase with 0 maximum marks has nothing to grade: the evaluator only ticks "Evaluated"
  const noMarks = !!row && max === 0;
  const alreadyEvaluated = row?.evaluation?.status === EvaluationStatus.SUBMITTED;
  const [evaluatedChecked, setEvaluatedChecked] = useState(false);

  useEffect(() => {
    if (!row) return;
    setError(null);
    const given = Object.fromEntries((row.evaluation?.student_marks || []).map((m) => [m.student_id, num(m.marks)]));
    const start = row.evaluation ? num(row.evaluation.default_marks) : submitted ? "" : "0";
    setMaster(start);
    setPerStudent(Object.fromEntries(row.team.members.map((m) => [m.id, given[m.id] ?? start])));
    setRemarks(row.evaluation?.remarks ?? "");
    setEvaluatedChecked(row.evaluation?.status === EvaluationStatus.SUBMITTED);
  }, [row, submitted]);

  const applyToAll = (value) => {
    setMaster(value);
    setPerStudent(Object.fromEntries(members.map((m) => [m.id, value])));
  };

  const mutation = useApiMutation(
    (submit) =>
      save(row, {
        default_marks: noMarks ? "0" : master === "" ? null : master,
        student_marks: members.map((m) => ({ student_id: m.id, marks: noMarks ? "0" : perStudent[m.id] })),
        remarks,
        submit,
      }),
    {
      invalidate,
      silentError: true,
      success: (_, submit) =>
        noMarks ? (submit ? "Marked as evaluated" : "Marked as not evaluated") : submit ? "Marks submitted" : "Marks saved as draft",
      onSuccess: () => onOpenChange(false),
    },
  );

  const run = (submit) => {
    if (noMarks) {
      setError(null);
      return mutation
        .mutateAsync(evaluatedChecked)
        .catch((e) => setError(e.details?.student_marks?.join(" ") || e.details?.default_marks?.join(" ") || e.message));
    }
    for (const m of members) {
      const raw = perStudent[m.id];
      const value = Number(raw);
      if (raw === "" || raw === undefined || Number.isNaN(value)) return setError(`Enter marks for ${m.name}, or a mark for everyone.`);
      if (value < 0 || value > max) return setError(max === 0 ? "This phase has 0 maximum marks, so every mark must be 0." : `${m.name}: marks must be between 0 and ${max}.`);
      if (!submitted && !correction && value !== 0) return setError("Nothing was submitted for this phase, so every mark must be 0.");
    }
    setError(null);
    mutation.mutateAsync(submit).catch((e) => setError(e.details?.student_marks?.join(" ") || e.details?.default_marks?.join(" ") || e.message));
  };

  return (
    <FormDialog
      open={!!row}
      onOpenChange={onOpenChange}
      title={`${correction && !readOnly ? "Marks (Admin override)" : "Marks"} · ${row?.team.display_name ?? ""}`}
      description={row ? `${row.phase.name} · ${noMarks ? "no marks for this phase" : `each student out of ${max}`}${row.phase.evaluation_end_date ? ` · evaluation ends ${formatDate(row.phase.evaluation_end_date)}` : ""}` : undefined}
    >
      {row && (
        <div className="space-y-5">
          <FormError message={error} />
          {row.evaluation && row.evaluation.status !== EvaluationStatus.SUBMITTED && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              Saved as <StatusBadge status={row.evaluation.status} group="EvaluationStatus" />
            </p>
          )}
          {readOnly && readOnlyReason && (
            <Alert>
              <AlertDescription>{readOnlyReason}</AlertDescription>
            </Alert>
          )}
          {!readOnly && !submitted && !noMarks && (
            <Alert>
              <AlertDescription>
                {correction
                  ? "This team didn't submit for this phase. As Admin you can still give any marks."
                  : "This team didn't submit for this phase. Every member gets 0."}
              </AlertDescription>
            </Alert>
          )}

          {noMarks ? (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="mark-evaluated"
                  checked={evaluatedChecked}
                  onCheckedChange={(v) => setEvaluatedChecked(v === true)}
                  disabled={readOnly}
                />
                <Label htmlFor="mark-evaluated">Evaluated</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                This phase carries no marks. Tick to mark this team as evaluated; you can untick it until the phase is locked.
              </p>
            </div>
          ) : (
          <>
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <Label htmlFor="master-marks">Marks for everyone</Label>
            <div className="flex items-center gap-2">
              <div className="w-36">
                <MarksInput id="master-marks" value={master} onChange={applyToAll} disabled={locked} />
              </div>
              <span className="text-xs text-muted-foreground">Fills every member below; then change anyone individually.</span>
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Per student</h3>
            <ul className="divide-y rounded-md border">
              {members.map((m) => {
                const differs = master !== "" && perStudent[m.id] !== "" && Number(perStudent[m.id]) !== Number(master);
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 text-sm">
                      <p className="flex items-center gap-1.5 truncate font-medium">
                        {m.id === row.team.lead_id && <Crown className="size-3.5 text-primary" aria-label="Team Lead" />}
                        {m.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{m.roll_number}</span> · Section {m.section.name}
                        {differs && <span className="text-primary"> · individual</span>}
                      </p>
                    </div>
                    <div className="w-32 shrink-0">
                      <MarksInput
                        value={perStudent[m.id] ?? ""}
                        onChange={(v) => setPerStudent((p) => ({ ...p, [m.id]: v }))}
                        disabled={locked}
                        aria-label={`Marks for ${m.name}`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          </>
          )}

          <div className="space-y-2">
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea id="remarks" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional feedback (not shown to students)" disabled={readOnly} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly && !correction && !noMarks && (
              <Button variant="secondary" onClick={() => run(false)} disabled={mutation.isPending}>
                Save draft
              </Button>
            )}
            {!readOnly && (
            <Button onClick={() => run(true)} disabled={mutation.isPending || (noMarks && !evaluatedChecked && !alreadyEvaluated && !row.evaluation)}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {noMarks ? "Save" : correction ? "Save marks" : "Submit marks"}
            </Button>
            )}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
