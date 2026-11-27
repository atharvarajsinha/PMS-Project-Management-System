import FormDialog from "@/components/common/FormDialog";
import { Button } from "@/components/ui/button";
import { isSubmitted, LinkList, MemberList, offeringShort, PhaseStatus, ProjectSummary, SubmissionState } from "@/features/teams/components/TeamBits";
import { TeamRole } from "@/config/choices";
import { formatDateTime } from "@/lib/utils";

/** Read-only view of one team's submission for one phase, with the team's project title and description. */
export default function SubmissionViewDialog({ row, onOpenChange }) {
  const sub = row?.submission;
  return (
    <FormDialog
      open={!!row}
      onOpenChange={onOpenChange}
      title={row ? `Submission · ${row.team.display_name}` : "Submission"}
      description={row ? `${offeringShort(row.semester_subject)} · ${row.phase.name}` : undefined}
      className="sm:max-w-2xl"
    >
      {row && (
        <div className="space-y-5">
          <section className="space-y-2 rounded-md border bg-muted/30 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</h3>
            <ProjectSummary team={row.team} />
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">This phase</h3>
              <span className="flex items-center gap-2">
                <PhaseStatus status={row.phase.status} />
                <SubmissionState submission={sub} />
              </span>
            </div>
            {sub ? (
              <>
                {sub.submitted_at && (
                  <p className="text-xs text-muted-foreground">
                    {isSubmitted(sub) ? "Submitted" : "Last submitted"} {formatDateTime(sub.submitted_at)}
                    {sub.submitted_by && ` by ${sub.submitted_by.name}`}
                  </p>
                )}
                <LinkList links={sub.links} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing was sent for this phase.</p>
            )}
          </section>

          {sub?.notes && (
            <section className="space-y-1">
              <h3 className="text-sm font-semibold">Notes for the evaluator</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{sub.notes}</p>
            </section>
          )}

          <section className="space-y-1">
            <h3 className="text-sm font-semibold">Members</h3>
            <MemberList
              members={row.team.members.map((m) => ({ ...m, role: m.id === row.team.lead_id ? TeamRole.LEAD : TeamRole.MEMBER }))}
            />
          </section>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
