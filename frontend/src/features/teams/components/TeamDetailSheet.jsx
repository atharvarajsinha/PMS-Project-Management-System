import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2, RotateCcw, Trash2, UserMinus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import ErrorState from "@/components/common/ErrorState";
import StatusBadge from "@/components/common/StatusBadge";
import { EvaluatorSource, TeamRole } from "@/config/choices";
import { listSemesterMentors } from "@/features/mentors/api";
import StudentPicker from "@/features/teams/components/StudentPicker";
import { MemberList, offeringLabel, PhaseStatus } from "@/features/teams/components/TeamBits";
import {
  addTeamMember,
  assignMentor,
  changeTeamLead,
  deleteTeam,
  getTeam,
  listUnassignedStudents,
  removeMentor,
  removeTeamMember,
  setEvaluator,
  teamsInvalidate,
  updateTeam,
} from "@/features/teams/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useFacultyOptions } from "@/hooks/useLookups";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { apiId, idStr } from "@/lib/ids";

function Section({ title, description, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Admin override: team name and the project title/description the team sent in phase 1. */
function RenameForm({ team }) {
  const initial = { name: team.name, project_title: team.project_title || "", project_description: team.project_description || "" };
  const [values, setValues] = useState(initial);
  useEffect(
    () => setValues({ name: team.name, project_title: team.project_title || "", project_description: team.project_description || "" }),
    [team.name, team.project_title, team.project_description],
  );
  const changed = Object.keys(initial).some((k) => values[k] !== initial[k]);
  const mutation = useApiMutation(() => updateTeam(team.id, values), { invalidate: teamsInvalidate, success: "Team details saved" });
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="team-edit-name">Team name</Label>
        <Input id="team-edit-name" value={values.name} onChange={set("name")} placeholder={`Team #${team.id}`} maxLength={100} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="team-edit-title">Project title</Label>
        <Input id="team-edit-title" value={values.project_title} onChange={set("project_title")} maxLength={200} placeholder="Not sent yet" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="team-edit-description">Project description</Label>
        <Textarea id="team-edit-description" rows={3} value={values.project_description} onChange={set("project_description")} maxLength={5000} />
      </div>
      <Button type="submit" variant="outline" size="sm" disabled={mutation.isPending || !changed}>
        {mutation.isPending && <Loader2 className="size-4 animate-spin" />} Save
      </Button>
    </form>
  );
}

function MentorSection({ team }) {
  const semesterId = team.semester_subject.semester.id;
  const mentors = useQuery({
    queryKey: ["semester-mentors", "options", semesterId],
    queryFn: () => listSemesterMentors({ semester_id: semesterId, page_size: 200, ordering: "name" }),
  });
  const [facultyId, setFacultyId] = useState("");
  const [replace, setReplace] = useState(true);
  const [override, setOverride] = useState(false);
  const assign = useApiMutation(
    () => assignMentor(team.id, { faculty_id: apiId(facultyId), replace, override_capacity: override }),
    { invalidate: teamsInvalidate, success: "Mentor assigned", onSuccess: () => setFacultyId("") },
  );
  const remove = useApiMutation((a) => removeMentor(team.id, a.id), { invalidate: teamsInvalidate, success: "Mentor removed" });
  const slots = mentors.data?.results || [];

  return (
    <Section title="Mentor" description="Assigning here skips the request step. Capacity is checked unless you override it.">
      {team.mentors.length ? (
        <ul className="divide-y rounded-md border">
          {team.mentors.map((m) => (
            <li key={m.id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                {m.faculty.name} <StatusBadge status={m.status} group="MentorStatus" />
              </span>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(m)} disabled={remove.isPending} aria-label={`Remove ${m.faculty.name}`}>
                <X className="size-4" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No mentor yet.</p>
      )}
      <div className="space-y-3 rounded-md border p-3">
        <Select value={facultyId} onValueChange={setFacultyId}>
          <SelectTrigger aria-label="Mentor to assign">
            <SelectValue placeholder={slots.length ? "Choose from this semester's mentors" : "No mentors listed for this semester"} />
          </SelectTrigger>
          <SelectContent>
            {slots.map((s) => (
              <SelectItem key={s.id} value={idStr(s.faculty.id)}>
                {s.faculty.name} — {s.free} free of {s.capacity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-2 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={replace} onCheckedChange={(v) => setReplace(!!v)} /> Replace current mentor / pending request
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} /> Allow over capacity
          </label>
        </div>
        <Button size="sm" onClick={() => assign.mutate()} disabled={!facultyId || assign.isPending}>
          {assign.isPending && <Loader2 className="size-4 animate-spin" />} Assign mentor
        </Button>
      </div>
    </Section>
  );
}

function EvaluatorSection({ team }) {
  const faculty = useFacultyOptions({ activeOnly: true });
  const set = useApiMutation(({ phaseId, facultyId }) => setEvaluator(team.id, { evaluator_id: facultyId, phase_ids: phaseId ? [phaseId] : undefined }), {
    invalidate: teamsInvalidate,
    success: (_, v) => (v.facultyId ? "Evaluator set" : "Evaluator reset to automatic"),
  });
  if (!team.evaluators.length) return <Section title="Evaluators"><p className="text-sm text-muted-foreground">This subject has no phases yet.</p></Section>;
  return (
    <Section
      title="Evaluators"
      description="Automatic = the faculty teaching this subject in the Team Lead's section. You can pick any active faculty member instead."
    >
      <ul className="divide-y rounded-md border">
        {team.evaluators.map((e) => (
          <li key={e.id} className="space-y-2 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {e.phase.name} <PhaseStatus status={e.phase.status} />
              </span>
              {e.source === EvaluatorSource.ADMIN_OVERRIDE && <StatusBadge status={e.source} group="EvaluatorSource" />}
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={idStr(e.evaluator?.id) || "__none"}
                onValueChange={(v) => set.mutate({ phaseId: e.phase.id, facultyId: v === "__none" ? null : apiId(v) })}
                disabled={set.isPending}
              >
                <SelectTrigger className={e.evaluator ? "h-9" : "h-9 border-warning/40 text-warning"} aria-label={`Evaluator for ${e.phase.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none" disabled>
                    Evaluator pending
                  </SelectItem>
                  {faculty.options.map((o) => (
                    <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {e.source === EvaluatorSource.ADMIN_OVERRIDE && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => set.mutate({ phaseId: e.phase.id, facultyId: null })}
                  disabled={set.isPending}
                  title="Back to automatic"
                >
                  <RotateCcw className="size-4" /> Auto
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function TeamDetailSheet({ teamId, onOpenChange }) {
  const isDesktop = useIsDesktop();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useQuery({ queryKey: ["teams", "detail", teamId], queryFn: () => getTeam(teamId), enabled: !!teamId });
  const team = query.data;

  const add = useApiMutation((s) => addTeamMember(team.id, s.id), { invalidate: teamsInvalidate, success: (_, s) => `${s.name} added` });
  const remove = useApiMutation((m) => removeTeamMember(team.id, m.id), { invalidate: teamsInvalidate, success: (_, m) => `${m.name} removed` });
  const lead = useApiMutation((m) => changeTeamLead(team.id, m.id), { invalidate: teamsInvalidate, success: (_, m) => `${m.name} is now Team Lead` });
  const del = useApiMutation(() => deleteTeam(team.id), { invalidate: teamsInvalidate, success: "Team deleted", onSuccess: () => onOpenChange(false) });

  return (
    <Sheet open={!!teamId} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full overflow-y-auto sm:max-w-lg" : "max-h-[90dvh] overflow-y-auto rounded-t-lg"}
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>{team?.display_name || "Team"}</SheetTitle>
          <SheetDescription>{team ? offeringLabel(team.semester_subject) : " "}</SheetDescription>
        </SheetHeader>
        {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.isLoading && <Skeleton className="h-60 w-full" />}
        {team && (
          <div className="space-y-8">
            <Section title="Name and project" description="Sent by the team in phase 1 (the evaluator can also rename it). As Admin you can change these at any time.">
              <RenameForm team={team} />
            </Section>

            <Section
              title={`Members (${team.members_count})`}
              description={team.is_complete ? undefined : "Below the minimum team size."}
            >
              <MemberList
                members={team.members}
                actions={(m) =>
                  m.role !== TeamRole.LEAD && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => lead.mutate(m)} disabled={lead.isPending} title="Make Team Lead">
                        <Crown className="size-4" /> <span className="sr-only md:not-sr-only">Lead</span>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(m)} disabled={remove.isPending} title="Remove from team">
                        <UserMinus className="size-4" /> <span className="sr-only">Remove {m.name}</span>
                      </Button>
                    </>
                  )
                }
              />
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-sm font-medium">Add a student</summary>
                <div className="mt-3">
                  <StudentPicker
                    queryKey={["teams", "unassigned", team.semester_subject.id]}
                    fetcher={(p) => listUnassignedStudents({ ...p, semester_subject_id: team.semester_subject.id })}
                    onPick={(s) => add.mutate(s)}
                    pendingId={add.isPending ? add.variables?.id : null}
                    emptyText="Every eligible student is already in a team."
                  />
                </div>
              </details>
            </Section>

            <MentorSection team={team} />
            <EvaluatorSection team={team} />

            <div className="border-t pt-6">
              <Button variant="outline" className="text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" /> Delete team
              </Button>
            </div>
          </div>
        )}
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${team?.display_name}?`}
          description="Members become free to join other teams. Its submissions, mentor and evaluator assignments and marks are deleted. This cannot be undone."
          confirmText={team?.display_name}
          onConfirm={() => del.mutateAsync()}
        />
      </SheetContent>
    </Sheet>
  );
}
