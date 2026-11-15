import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Crown, LogOut, Mail, Send, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import FormDialog from "@/components/common/FormDialog";
import StatusBadge from "@/components/common/StatusBadge";
import { MentorStatus, PhaseStatus as PS, TeamRole } from "@/config/choices";
import SubmissionDialog from "@/features/projects/components/SubmissionDialog";
import {
  acceptInvite,
  cancelInvite,
  cancelMentorRequest,
  createMyTeam,
  declineInvite,
  disbandMyTeam,
  inviteStudent,
  leaveMyTeam,
  listEligibleStudents,
  listInviteHistory,
  listMentorRequests,
  listTeamMentors,
  makeLead,
  projectsKey,
  removeMyTeamMember,
  requestMentor,
} from "@/features/projects/api";
import StudentPicker from "@/features/teams/components/StudentPicker";
import { EvaluatorLine, LinkList, MemberList, PhaseStatus, PhaseWindows } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { formatDate, formatDateTime } from "@/lib/utils";

const invalidate = [projectsKey];

function MentorPicker({ teamId, open, onOpenChange }) {
  const query = useQuery({ queryKey: ["my", "team-mentors", teamId], queryFn: () => listTeamMentors(teamId), enabled: open });
  const request = useApiMutation((m) => requestMentor(teamId, m.faculty.id), {
    invalidate,
    success: (_, m) => `Request sent to ${m.faculty.name}`,
    onSuccess: () => onOpenChange(false),
  });
  const rows = query.data || [];
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Choose a mentor" description="Send a request to one mentor at a time. They accept or reject it; once a mentor is full, waiting requests are declined automatically.">
      <ul className="divide-y rounded-md border">
        {rows.map((m) => (
          <li key={m.faculty.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
            <div className="text-sm">
              <p className="font-medium">{m.faculty.name}</p>
              <StatusBadge status={m.available ? "ACTIVE" : "LOCKED"} label={m.available ? "Available" : "Full"} />
            </div>
            <Button size="sm" onClick={() => request.mutate(m)} disabled={!m.available || request.isPending}>
              <Send className="size-4" /> Request
            </Button>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-4 text-sm text-muted-foreground">{query.isLoading ? "Loading…" : "No mentors have been listed for your semester yet."}</li>}
      </ul>
    </FormDialog>
  );
}

/** Team Lead: every invite sent and how each student answered. */
function InviteHistory({ teamId }) {
  const query = useQuery({ queryKey: [...projectsKey, "invite-history", teamId], queryFn: () => listInviteHistory(teamId) });
  const rows = query.data || [];
  if (query.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="text-xs text-muted-foreground">No invites sent yet.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{r.student.name}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{r.student.roll_number}</span> · Section {r.student.section.name} · invited{" "}
              {formatDateTime(r.created_at)}
              {r.responded_at && ` · answered ${formatDateTime(r.responded_at)}`}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusBadge status={r.status} group="InviteStatus" />
            {r.is_automatic && "joined another team"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Team Lead: every mentor request of the team and how it ended. */
function MentorRequestHistory({ teamId }) {
  const query = useQuery({ queryKey: [...projectsKey, "mentor-requests", teamId], queryFn: () => listMentorRequests(teamId) });
  const rows = query.data || [];
  if (query.isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (!rows.length) return <p className="text-xs text-muted-foreground">No requests sent yet.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="font-medium">{r.faculty.name}</p>
            <p className="text-xs text-muted-foreground">
              Requested {formatDateTime(r.created_at)}
              {r.decided_at && ` · answered ${formatDateTime(r.decided_at)}`}
            </p>
            {r.note && <p className="text-xs">{r.note}</p>}
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <StatusBadge status={r.status} group="MentorStatus" />
            {r.is_automatic && "mentor was full"}
            {r.by_admin && "by Admin"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InviteDialog({ teamId, open, onOpenChange }) {
  const invite = useApiMutation((s) => inviteStudent(teamId, s.id), { invalidate, success: (_, s) => `Invite sent to ${s.name}` });
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Invite a classmate" description="Only students who take this subject and aren't in a team for it are listed.">
      {open && (
        <StudentPicker
          queryKey={["my", "eligible", teamId]}
          fetcher={(p) => listEligibleStudents(teamId, p)}
          actionLabel="Invite"
          onPick={(s) => invite.mutate(s)}
          pendingId={invite.isPending ? invite.variables?.id : null}
          emptyText="No one left to invite."
        />
      )}
    </FormDialog>
  );
}

function Phases({ phases, teamId, canSubmit }) {
  const [editing, setEditing] = useState(null);
  if (!phases.length) return <p className="text-sm text-muted-foreground">Your Admin hasn't added phases for this subject yet.</p>;
  return (
    <>
      <ul className="divide-y rounded-md border">
        {phases.map((p) => (
          <li key={p.id} className="space-y-2 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {p.name} <PhaseStatus status={p.status} />
                </p>
                <p className="text-xs text-muted-foreground">Max {Number(p.max_marks)} marks</p>
                {p.short_description && <p className="mt-1 text-xs">{p.short_description}</p>}
              </div>
            </div>
            <PhaseWindows phase={p} showProgress={!!teamId} />
            {p.description && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">Details</summary>
                <p className="mt-1 whitespace-pre-wrap">{p.description}</p>
              </details>
            )}
            {p.submission?.links?.length > 0 && <LinkList links={p.submission.links} />}
            {teamId && p.status === PS.OPEN && canSubmit && (
              <Button size="sm" variant={p.submission ? "outline" : "default"} onClick={() => setEditing(p)}>
                <Send className="size-4" /> {p.submission ? "Edit submission" : "Submit links"}
              </Button>
            )}
            {teamId && p.status === PS.UPCOMING && <p className="text-xs text-muted-foreground">Opens on {formatDate(p.start_date)}.</p>}
          </li>
        ))}
      </ul>
      <SubmissionDialog teamId={teamId} phase={editing} onOpenChange={() => setEditing(null)} />
    </>
  );
}

export default function SubjectCard({ item, settings, studentId }) {
  const { semester_subject: o, team, is_lead: isLead, invites, phases } = item;
  const [dialog, setDialog] = useState(null); // "mentor" | "invite"
  const [confirm, setConfirm] = useState(null); // { kind, member? }
  const canChange = settings.team_formation_enabled && !settings.teams_locked;

  const create = useApiMutation(() => createMyTeam(o.id), { invalidate, success: "Team created. You're the Team Lead — invite your teammates." });
  const accept = useApiMutation((i) => acceptInvite(i.id), { invalidate, success: (_, i) => `You joined ${i.team_name}` });
  const decline = useApiMutation((i) => declineInvite(i.id), { invalidate, success: "Invite declined" });
  const cancel = useApiMutation((i) => cancelInvite(team.id, i.id), { invalidate, success: "Invite cancelled" });
  const cancelMentor = useApiMutation(() => cancelMentorRequest(team.id), { invalidate, success: "Mentor request cancelled" });
  const remove = useApiMutation((m) => removeMyTeamMember(team.id, m.id), { invalidate, success: (_, m) => `${m.name} removed` });
  const lead = useApiMutation((m) => makeLead(team.id, m.id), { invalidate, success: (_, m) => `${m.name} is now Team Lead` });
  const leave = useApiMutation(() => leaveMyTeam(team.id), { invalidate, success: "You left the team" });
  const disband = useApiMutation(() => disbandMyTeam(team.id), { invalidate, success: "Team disbanded" });

  const mentor = team?.mentors?.[0];
  const pendingMentor = team?.mentors?.find((m) => m.status === MentorStatus.PENDING);

  const confirmCopy = {
    remove: { title: `Remove ${confirm?.member?.name}?`, description: "They can join another team afterwards.", label: "Remove", run: () => remove.mutateAsync(confirm.member) },
    lead: {
      title: `Make ${confirm?.member?.name} Team Lead?`,
      description: "They'll manage the team, its invites and the mentor request. Your evaluator may change to the faculty of their section.",
      label: "Make Team Lead",
      run: () => lead.mutateAsync(confirm.member),
    },
    leave: { title: "Leave this team?", description: "You can join or create another team for this subject while team formation is open.", label: "Leave", run: () => leave.mutateAsync() },
    disband: { title: "Disband this team?", description: "Everyone becomes free to join other teams. This cannot be undone.", label: "Disband", run: () => disband.mutateAsync() },
  }[confirm?.kind];

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {o.subject.code} — {o.subject.name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{team ? "Team Name: "+team.display_name : "You're not in a team yet"}</p>
          </div>
          {team && <StatusBadge status={isLead ? TeamRole.LEAD : TeamRole.MEMBER} group="TeamRole" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!team && (
          <div className="space-y-3">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" aria-hidden /> {i.lead} invited you to <strong>{i.team_name}</strong>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => accept.mutate(i)} disabled={!canChange || accept.isPending}>
                    <Check className="size-4" /> Join
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => decline.mutate(i)} disabled={decline.isPending}>
                    Decline
                  </Button>
                </span>
              </div>
            ))}
            {canChange ? (
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                <UserPlus className="size-4" /> Create a team
              </Button>
            ) : (
              <Alert>
                <AlertDescription>
                  {settings.teams_locked ? "Teams are locked. Contact your Admin to be added to a team." : "Team formation hasn't opened yet."}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {team && (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  Members ({team.members_count}/{settings.max_team_size})
                </h3>
                {isLead && canChange && team.members_count < settings.max_team_size && (
                  <Button size="sm" variant="outline" onClick={() => setDialog("invite")}>
                    <UserPlus className="size-4" /> Invite
                  </Button>
                )}
              </div>
              {!team.is_complete && (
                <p className="text-xs text-warning">A team needs at least {settings.min_team_size} members.</p>
              )}
              <MemberList
                members={team.members}
                actions={
                  isLead && canChange
                    ? (m) =>
                        m.id !== studentId && (
                          <>
                            <Button size="sm" variant="ghost" title="Make Team Lead" onClick={() => setConfirm({ kind: "lead", member: m })}>
                              <Crown className="size-4" />
                              <span className="sr-only">Make {m.name} Team Lead</span>
                            </Button>
                            <Button size="sm" variant="ghost" title="Remove" onClick={() => setConfirm({ kind: "remove", member: m })}>
                              <UserMinus className="size-4" />
                              <span className="sr-only">Remove {m.name}</span>
                            </Button>
                          </>
                        )
                    : undefined
                }
              />
              {isLead && (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Invite history</summary>
                  <div className="mt-2">
                    <InviteHistory teamId={team.id} />
                  </div>
                </details>
              )}
              {isLead && team.pending_invites.length > 0 && (
                <ul className="space-y-1 text-sm">
                  {team.pending_invites.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 text-muted-foreground">
                      <span>Invited {i.student.name} · waiting</span>
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(i)} disabled={cancel.isPending}>
                        <X className="size-4" /> Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Mentor</h3>
              {mentor ? (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  {mentor.faculty.name} <StatusBadge status={mentor.status} group="MentorStatus" />
                  {isLead && pendingMentor && (
                    <Button size="sm" variant="ghost" onClick={() => cancelMentor.mutate()} disabled={cancelMentor.isPending}>
                      Cancel request
                    </Button>
                  )}
                </p>
              ) : isLead ? (
                <Button size="sm" variant="outline" onClick={() => setDialog("mentor")} disabled={!team.is_complete}>
                  Choose a mentor
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Your Team Lead chooses the mentor.</p>
              )}
              {isLead && !mentor && !team.is_complete && <p className="text-xs text-muted-foreground">Complete your team first.</p>}
              {isLead && (
                <details className="pt-1">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Request history</summary>
                  <div className="mt-2">
                    <MentorRequestHistory teamId={team.id} />
                  </div>
                </details>
              )}
            </section>

            <section className="space-y-1">
              <h3 className="text-sm font-semibold">Evaluator</h3>
              <p className="text-sm">
                <EvaluatorLine evaluators={team.evaluators} />
              </p>
            </section>
          </>
        )}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Phases</h3>
          <Phases phases={phases} teamId={team?.id} canSubmit={!!team} />
        </section>

        {team && canChange && (
          <div className="border-t pt-4">
            {isLead ? (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirm({ kind: "disband" })}>
                <Trash2 className="size-4" /> Disband team
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirm({ kind: "leave" })}>
                <LogOut className="size-4" /> Leave team
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {team && <MentorPicker teamId={team.id} open={dialog === "mentor"} onOpenChange={(v) => setDialog(v ? "mentor" : null)} />}
      {team && <InviteDialog teamId={team.id} open={dialog === "invite"} onOpenChange={(v) => setDialog(v ? "invite" : null)} />}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={confirmCopy?.title}
        description={confirmCopy?.description}
        confirmLabel={confirmCopy?.label}
        destructive={confirm?.kind !== "lead"}
        onConfirm={() => confirmCopy.run()}
      />
    </Card>
  );
}
