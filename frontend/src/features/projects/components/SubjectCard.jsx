import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Crown, LogOut, Mail, Send, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Carousel from "@/components/common/Carousel";
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
import { EvaluatorLine, LinkList, MemberList, PhaseStatus, PhaseWindows, ProjectPhaseBadge, ProjectSummary, SubmissionState } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { Markdown } from "@/components/common/Markdown";
import { RubricList } from "@/features/phases/components/Rubric";

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
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium">
                {m.faculty.name}
                {m.designation && <span className="font-normal text-muted-foreground"> · {m.designation}</span>}
              </p>
              {!!m.specializations?.length && (
                <p className="text-xs text-muted-foreground">{m.specializations.join(", ")}</p>
              )}
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

/** One labelled row of the project's details: label on the left (stacked on phones), content on the right. */
function DetailRow({ label, action, children }) {
  return (
    <section className="grid gap-2 border-t py-4 first:border-t-0 first:pt-0 md:grid-cols-[10rem_1fr] md:gap-6">
      <div className="flex items-start justify-between gap-2 md:flex-col md:justify-start">
        <h3 className="text-sm font-semibold">{label}</h3>
        {action}
      </div>
      <div className="min-w-0 space-y-2">{children}</div>
    </section>
  );
}

/** The phase to open first: the one taking submissions, else the next upcoming one, else the last. */
function startingPhase(phases) {
  const open = phases.findIndex((p) => p.status === PS.OPEN);
  if (open >= 0) return open;
  const upcoming = phases.findIndex((p) => p.status === PS.UPCOMING);
  return upcoming >= 0 ? upcoming : phases.length - 1;
}

function PhaseSlide({ phase: p, team, canSubmit, onSubmit }) {
  const sub = p.submission;
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {p.name} <PhaseStatus status={p.status} /> {p.is_project_phase && <ProjectPhaseBadge />}
          </p>
          <p className="text-xs text-muted-foreground">Max {Number(p.max_marks)} marks</p>
        </div>
        {team && p.status === PS.OPEN && canSubmit && (
          <Button size="sm" variant={sub ? "outline" : "default"} onClick={() => onSubmit(p)}>
            <Send className="size-4" /> {sub ? "Edit submission" : p.is_project_phase ? "Submit project" : "Submit links"}
          </Button>
        )}
      </div>

      {p.short_description && <p className="text-sm">{p.short_description}</p>}
      {p.is_project_phase && (
        <p className="text-xs text-muted-foreground">In this phase your team sends its project title and description, and can set its team name. Links are optional.</p>
      )}

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="font-medium text-muted-foreground">Timeline</dt>
        <dd>
          <PhaseWindows phase={p} showProgress={!!team} />
        </dd>
        {p.description && (
          <>
            <dt className="font-medium text-muted-foreground">Details</dt>
            <dd>
              <Markdown>{p.description}</Markdown>
            </dd>
          </>
        )}
        {!!p.criteria?.length && (
          <>
            <dt className="font-medium text-muted-foreground">Criteria</dt>
            <dd>
              <RubricList
                criteria={p.criteria}
                showResults={!!team && p.status === PS.LOCKED}
                resultsNote={team && p.status !== PS.LOCKED ? "Your evaluator checks these. You'll see the results here once evaluation is locked." : undefined}
              />
            </dd>
          </>
        )}
        {team && (
          <>
            <dt className="font-medium text-muted-foreground">Your submission</dt>
            <dd className="space-y-2">
              {sub ? (
                <>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <SubmissionState submission={sub} />
                    {sub.submitted_at && `${formatDateTime(sub.submitted_at)}${sub.submitted_by ? ` by ${sub.submitted_by.name}` : ""}`}
                  </p>
                  {p.is_project_phase && <ProjectSummary team={team} />}
                  {(!p.is_project_phase || sub.links?.length > 0) && <LinkList links={sub.links} />}
                  {sub.notes && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Notes for the evaluator</p>
                      <p className="whitespace-pre-wrap">{sub.notes}</p>
                    </div>
                  )}
                </>
              ) : p.status === PS.UPCOMING ? (
                <p className="text-muted-foreground">Opens on {formatDate(p.start_date)}.</p>
              ) : p.status === PS.OPEN ? (
                <p className="text-muted-foreground">Nothing sent yet.</p>
              ) : (
                <p className="text-muted-foreground">Nothing was sent for this phase.</p>
              )}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function Phases({ phases, team, canSubmit }) {
  const [editing, setEditing] = useState(null);
  const [index, setIndex] = useState(() => startingPhase(phases));
  if (!phases.length) return <p className="text-sm text-muted-foreground">Your Admin hasn't added phases for this subject yet.</p>;
  return (
    <>
      <Carousel
        label="Phases"
        size="sm"
        items={phases}
        index={index}
        onIndexChange={setIndex}
        itemKey={(p) => p.id}
        tabLabel={(p, i) => (
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {p.name}
            <span
              className={cn(
                "size-2 rounded-full",
                p.status === PS.OPEN ? "bg-success" : p.status === PS.UPCOMING ? "bg-muted-foreground/40" : "bg-primary/60",
              )}
              aria-hidden
            />
          </span>
        )}
        renderItem={(p) => <PhaseSlide phase={p} team={team} canSubmit={canSubmit} onSubmit={setEditing} />}
      />
      <SubmissionDialog teamId={team?.id} team={team} phase={editing} onOpenChange={() => setEditing(null)} />
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
  const projectPhase = phases.find((p) => p.is_project_phase);

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
      <CardHeader className="space-y-1 border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-lg">
              {o.subject.code} — {o.subject.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Semester {o.semester.semester_number} · {team ? `Team: ${team.display_name}` : "You're not in a team yet"}
            </p>
          </div>
          {team && <StatusBadge status={isLead ? TeamRole.LEAD : TeamRole.MEMBER} group="TeamRole" />}
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        {!team && (
          <DetailRow label="Team">
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
          </DetailRow>
        )}

        {team && (
          <>
            <DetailRow label="Project">
              {team.project_title || team.project_description ? (
                <ProjectSummary team={team} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {projectPhase
                    ? `Your team sends its project title and description in ${projectPhase.name}${
                        projectPhase.status === PS.UPCOMING ? ` (opens ${formatDate(projectPhase.start_date)})` : ""
                      }.`
                    : "Your team sends its project title and description in the first phase."}
                </p>
              )}
            </DetailRow>

            <DetailRow
              label={`Members (${team.members_count}/${settings.max_team_size})`}
              action={
                isLead &&
                canChange &&
                team.members_count < settings.max_team_size && (
                  <Button size="sm" variant="outline" onClick={() => setDialog("invite")}>
                    <UserPlus className="size-4" /> Invite
                  </Button>
                )
              }
            >
              {!team.is_complete && <p className="text-xs text-warning">A team needs at least {settings.min_team_size} members.</p>}
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
              {isLead && (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Invite history</summary>
                  <div className="mt-2">
                    <InviteHistory teamId={team.id} />
                  </div>
                </details>
              )}
            </DetailRow>

            <DetailRow label="Mentor">
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
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Request history</summary>
                  <div className="mt-2">
                    <MentorRequestHistory teamId={team.id} />
                  </div>
                </details>
              )}
            </DetailRow>

            <DetailRow label="Evaluator">
              <p className="text-sm">
                <EvaluatorLine evaluators={team.evaluators} />
              </p>
            </DetailRow>
          </>
        )}

        <DetailRow label={`Phases (${phases.length})`}>
          <Phases phases={phases} team={team} canSubmit={!!team} />
        </DetailRow>

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
