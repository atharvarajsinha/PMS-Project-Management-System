import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, Plus, Trash2, UsersRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BulkBar from "@/components/common/BulkBar";
import BulkDeleteButton, { selectColumn } from "@/components/common/BulkDeleteButton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import FormActions from "@/components/common/FormActions";
import FormDialog from "@/components/common/FormDialog";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import SearchInput from "@/components/common/SearchInput";
import StatusBadge from "@/components/common/StatusBadge";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect } from "@/components/common/fields";
import { getSettings } from "@/features/settings/api";
import StudentPicker from "@/features/teams/components/StudentPicker";
import TeamDetailSheet from "@/features/teams/components/TeamDetailSheet";
import { EvaluatorLine, MentorLine, offeringShort } from "@/features/teams/components/TeamBits";
import { bulkDeleteTeams, createTeam, deleteTeam, listTeams, listUnassignedStudents, teamsInvalidate } from "@/features/teams/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useOfferingOptions, useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { apiId, idStr } from "@/lib/ids";

// "Show" filter → API flags
const VIEWS = [
  { value: "incomplete", label: "Below minimum size", params: { incomplete: true } },
  { value: "no_mentor", label: "No mentor yet", params: { has_mentor: false } },
  { value: "mentor_pending", label: "Mentor request pending", params: { mentor_pending: true } },
  { value: "evaluator_pending", label: "Evaluator pending", params: { evaluator_pending: true } },
];

function NewTeamDialog({ open, onOpenChange, offeringId }) {
  const offerings = useOfferingOptions();
  const [offering, setOffering] = useState("");
  const [members, setMembers] = useState([]); // first = lead
  useEffect(() => {
    if (open) {
      setOffering(idStr(offeringId));
      setMembers([]);
    }
  }, [open, offeringId]);
  const mutation = useApiMutation(
    () => createTeam({ semester_subject_id: apiId(offering), lead_id: members[0].id, member_ids: members.slice(1).map((m) => m.id) }),
    { invalidate: teamsInvalidate, success: "Team created", onSuccess: () => onOpenChange(false) },
  );
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="New team" description="Admins can form teams any time, even while team formation is closed or teams are locked.">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label>Subject</Label>
          <Select
            value={offering}
            onValueChange={(v) => {
              setOffering(v);
              setMembers([]);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose a subject" />
            </SelectTrigger>
            <SelectContent>
              {offerings.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {offering && (
          <>
            <div className="space-y-2">
              <Label>Members {members.length > 0 && <span className="text-muted-foreground">(first one is Team Lead)</span>}</Label>
              {members.length > 0 && (
                <ul className="divide-y rounded-md border">
                  {members.map((m, i) => (
                    <li key={m.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                      <span>
                        {m.name} <span className="font-mono text-xs text-muted-foreground">{m.roll_number}</span>
                        {i === 0 && <StatusBadge className="ml-2" status="LEAD" group="TeamRole" />}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => setMembers((ms) => ms.filter((x) => x.id !== m.id))} aria-label={`Remove ${m.name}`}>
                        <X className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <StudentPicker
              queryKey={["teams", "unassigned", offering]}
              fetcher={(p) => listUnassignedStudents({ ...p, semester_subject_id: offering })}
              onPick={(s) => setMembers((ms) => (ms.some((m) => m.id === s.id) ? ms : [...ms, s]))}
              excludeIds={members.map((m) => m.id)}
              emptyText="Every eligible student is already in a team for this subject."
            />
          </>
        )}
        <FormActions onCancel={() => onOpenChange(false)} submitLabel="Create team" pending={mutation.isPending} disabled={!members.length} />
      </div>
    </FormDialog>
  );
}

function UnassignedList({ offeringId }) {
  const { params, setParam } = useListParams();
  const query = usePagedList(
    ["teams", "unassigned", offeringId, "page"],
    (p) => listUnassignedStudents({ ...p, semester_subject_id: offeringId }),
    { page: params.page, search: params.search },
    setParam,
  );
  const columns = [
    { key: "roll", header: "Roll no.", cell: (s) => <span className="font-mono text-[13px]">{s.roll_number}</span> },
    { key: "name", header: "Student", cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "section", header: "Section", cell: (s) => s.section.name },
    { key: "email", header: "Email", cell: (s) => s.email },
  ];
  return (
    <>
      <DataView
        columns={columns}
        rows={query.data?.results}
        renderCard={(s) => (
          <>
            <p className="font-medium">{s.name}</p>
            <CardFields fields={[["Roll no.", s.roll_number], ["Section", s.section.name]]} />
          </>
        )}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={<EmptyState icon={UsersRound} title="Everyone has a team" description="Every eligible student of this subject is in a team." />}
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
    </>
  );
}

export default function TeamsPage() {
  const { params, setParam, setParams } = useListParams();
  const semesters = useSemesterOptions();
  const offerings = useOfferingOptions(params.semester_id);
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [openTeam, setOpenTeam] = useState(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const selection = useSelection();
  const tab = params.tab === "unassigned" ? "unassigned" : "teams";

  const view = VIEWS.find((v) => v.value === params.view);
  const { view: _v, tab: _t, ...apiParams } = params;
  const query = usePagedList(["teams", "list"], listTeams, { ...apiParams, ...(view?.params || {}) }, setParam);
  const rows = query.data?.results;
  const remove = useApiMutation((t) => deleteTeam(t.id), { invalidate: teamsInvalidate, success: "Team deleted" });
  const select = selectColumn(selection, rows, (t) => t.display_name);
  const s = settings.data;

  const actions = (t) => (
    <RowActions
      label={`Actions for ${t.display_name}`}
      items={[
        { label: "Open", icon: Eye, onSelect: () => setOpenTeam(t.id) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setToDelete(t) },
      ]}
    />
  );
  const size = (t) => (
    <span className="flex items-center gap-2 tabular-nums">
      {t.members_count}
      {!t.is_complete && <StatusBadge status="PENDING" label="Too small" />}
    </span>
  );
  const teamCell = (t) => (
    <button type="button" className="text-left" onClick={() => setOpenTeam(t.id)}>
      <p className="font-medium text-primary underline-offset-4 hover:underline">{t.display_name}</p>
      <p className="text-xs text-muted-foreground">{offeringShort(t.semester_subject)}</p>
    </button>
  );

  const columns = [
    select,
    { key: "team", header: "Team", cell: teamCell },
    { key: "lead", header: "Team Lead", cell: (t) => `${t.lead.name} (${t.lead.section.name})` },
    { key: "size", header: "Members", cell: size },
    { key: "mentor", header: "Mentor", cell: (t) => <MentorLine mentors={t.mentors} /> },
    { key: "evaluator", header: "Evaluator", cell: (t) => <EvaluatorLine evaluators={t.evaluators} /> },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (t) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {select.cell(t)}
          {teamCell(t)}
        </div>
        {actions(t)}
      </div>
      <CardFields
        fields={[
          ["Team Lead", t.lead.name],
          ["Members", size(t)],
          ["Mentor", <MentorLine key="m" mentors={t.mentors} />],
          ["Evaluator", <EvaluatorLine key="e" evaluators={t.evaluators} />],
        ]}
      />
    </>
  );

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus className="size-4" /> New team
    </Button>
  );

  return (
    <>
      <PageHeader title="Teams" description="Project teams per subject. You can change any team, even after teams are locked." actions={newButton} />
      {s && (s.teams_locked || !s.team_formation_enabled) && (
        <Alert className="mb-4">
          <Lock className="size-4" />
          <AlertDescription>
            {s.teams_locked
              ? "Teams are locked: students can't change them. Changing a Team Lead no longer moves evaluators."
              : "Team formation is closed: students can't create or join teams yet."}{" "}
            <Link to="/admin/settings" className="font-medium text-primary underline-offset-4 hover:underline">
              Settings
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "teams" ? null : v, view: null })} className="mb-4">
        <TabsList>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="unassigned">Students without a team</TabsTrigger>
        </TabsList>
      </Tabs>
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder={tab === "teams" ? "Search team, student, roll…" : "Search students…"} />
        <FilterSelect
          label="Semester"
          allLabel="All semesters"
          value={params.semester_id}
          options={semesters.options}
          onChange={(v) => setParams({ semester_id: v, semester_subject_id: null })}
        />
        <FilterSelect
          label="Subject"
          allLabel={tab === "teams" ? "All subjects" : "Choose subject"}
          className="sm:w-60"
          value={params.semester_subject_id}
          options={offerings.options}
          onChange={(v) => setParam("semester_subject_id", v)}
        />
        {tab === "teams" && <FilterSelect label="Show" allLabel="All teams" value={params.view} options={VIEWS} onChange={(v) => setParam("view", v)} className="sm:w-52" />}
      </Toolbar>

      {tab === "unassigned" ? (
        params.semester_subject_id ? (
          <UnassignedList offeringId={params.semester_subject_id} />
        ) : (
          <div className="rounded-lg border">
            <EmptyState icon={UsersRound} title="Choose a subject" description="Pick a subject to see its students who aren't in a team yet." />
          </div>
        )
      ) : (
        <>
          <BulkBar count={selection.count} onClear={selection.clear}>
            <BulkDeleteButton
              selection={selection}
              noun={selection.count === 1 ? "team" : "teams"}
              mutationFn={bulkDeleteTeams}
              invalidate={teamsInvalidate}
              description="Members become free to join other teams. Submissions, assignments and marks of these teams are deleted."
            />
          </BulkBar>
          <DataView
            columns={columns}
            rows={rows}
            renderCard={renderCard}
            loading={query.isLoading}
            error={query.error}
            onRetry={query.refetch}
            empty={
              <EmptyState
                icon={UsersRound}
                title={params.search || params.view || params.semester_subject_id ? "No teams match" : "No teams yet"}
                description="Students form teams once team formation is turned on in Settings. You can also create teams here."
                action={newButton}
              />
            }
          />
          <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
        </>
      )}

      <TeamDetailSheet teamId={openTeam} onOpenChange={() => setOpenTeam(null)} />
      <NewTeamDialog open={creating} onOpenChange={setCreating} offeringId={params.semester_subject_id} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={() => setToDelete(null)}
        title={`Delete ${toDelete?.display_name}?`}
        description="Members become free to join other teams. Its submissions, assignments and marks are deleted. This cannot be undone."
        confirmText={toDelete?.display_name}
        onConfirm={() => remove.mutateAsync(toDelete)}
      />
    </>
  );
}
