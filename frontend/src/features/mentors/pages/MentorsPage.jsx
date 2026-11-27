import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AccountStatus } from "@/config/choices";
import ImportButton from "@/features/imports/components/ImportButton";
import { getSettings } from "@/features/settings/api";
import {
  addSemesterMentors,
  bulkDeleteSemesterMentors,
  deleteSemesterMentor,
  listSemesterMentors,
  updateSemesterMentor,
} from "@/features/mentors/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useFacultyOptions, useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";
import { apiId, sameId } from "@/lib/ids";
import { toast } from "sonner";

const invalidate = [["semester-mentors"], ["teams"]];

function AddMentorsDialog({ open, onOpenChange, semesterId, listedIds }) {
  const faculty = useFacultyOptions({ activeOnly: true });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [picked, setPicked] = useState([]);
  const [capacity, setCapacity] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setPicked([]);
      setSearch("");
      setCapacity(String(settings.data?.default_mentor_capacity ?? ""));
    }
  }, [open, settings.data]);

  const choices = faculty.options.filter(
    (o) => !o.disabled && !listedIds.some((id) => sameId(id, o.value)) && o.label.toLowerCase().includes(search.toLowerCase()),
  );
  const mutation = useApiMutation(
    () => addSemesterMentors({ semester_id: apiId(semesterId), faculty_ids: picked.map(apiId), capacity: Number(capacity) || undefined }),
    {
      invalidate,
      success: (r) => `${r.created.length} added to the mentor list`,
      onSuccess: (r) => {
        r.failed.forEach((f) => toast.warning(f.message));
        onOpenChange(false);
      },
    },
  );
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add mentors" description="They can then be chosen by teams of this semester, up to their capacity.">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="mentor-capacity">Teams each (capacity)</Label>
          <Input id="mentor-capacity" type="number" min={1} max={100} value={capacity} onChange={(e) => setCapacity(e.target.value)} className="w-32" />
        </div>
        <div className="space-y-2">
          <Label>Faculty</Label>
          <SearchInput value={search} onChange={setSearch} placeholder="Filter faculty…" />
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {choices.map((o) => (
              <li key={o.value}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent/50">
                  <Checkbox checked={picked.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                  {o.label}
                </label>
              </li>
            ))}
            {!choices.length && <li className="px-3 py-4 text-sm text-muted-foreground">{faculty.isLoading ? "Loading…" : "Every active faculty member is already on this list."}</li>}
          </ul>
        </div>
        <FormActions onCancel={() => onOpenChange(false)} submitLabel={`Add ${picked.length || ""}`.trim()} pending={mutation.isPending} disabled={!picked.length} />
      </form>
    </FormDialog>
  );
}

function CapacityDialog({ slot, onOpenChange }) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(String(slot?.capacity ?? "")), [slot]);
  const mutation = useApiMutation(() => updateSemesterMentor(slot.id, { capacity: Number(value) }), {
    invalidate,
    success: "Capacity updated",
    onSuccess: () => onOpenChange(false),
  });
  return (
    <FormDialog open={!!slot} onOpenChange={onOpenChange} title={`Capacity for ${slot?.faculty.name}`} description={`Currently holding ${slot?.load ?? 0} team(s) this semester.`}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="cap">Maximum teams</Label>
          <Input id="cap" type="number" min={1} max={100} value={value} onChange={(e) => setValue(e.target.value)} className="w-32" />
        </div>
        <FormActions onCancel={() => onOpenChange(false)} submitLabel="Save" pending={mutation.isPending} />
      </form>
    </FormDialog>
  );
}

export default function MentorsPage() {
  const semesters = useSemesterOptions();
  const { params, setParam } = useListParams({ ordering: "name" });
  const semesterId = params.semester_id || semesters.options[0]?.value;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const selection = useSelection();

  const query = usePagedList(["semester-mentors", "list"], listSemesterMentors, { ...params, semester_id: semesterId }, setParam);
  const rows = query.data?.results;
  const remove = useApiMutation((s) => deleteSemesterMentor(s.id), { invalidate, success: "Removed from the mentor list" });
  const select = selectColumn(selection, rows, (s) => s.faculty.name);

  const actions = (s) => (
    <RowActions
      label={`Actions for ${s.faculty.name}`}
      items={[
        { label: "Change capacity", icon: Pencil, onSelect: () => setEditing(s) },
        "separator",
        { label: "Remove from list", icon: Trash2, destructive: true, onSelect: () => setToDelete(s) },
      ]}
    />
  );
  const load = (s) => (
    <span className="tabular-nums">
      {s.load} / {s.capacity}
      {s.free === 0 && <StatusBadge className="ml-2" status="LOCKED" label="Full" />}
    </span>
  );

  const columns = [
    select,
    {
      key: "name",
      header: "Faculty",
      cell: (s) => (
        <div>
          <p className="font-medium">{s.faculty.name}</p>
          <p className="text-xs text-muted-foreground">{s.faculty.email}</p>
        </div>
      ),
    },
    { key: "status", header: "Account", cell: (s) => <StatusBadge status={s.faculty_status} group="AccountStatus" /> },
    { key: "load", header: "Teams / capacity", cell: load },
    { key: "accepted", header: "Accepted", className: "tabular-nums", cell: (s) => s.accepted },
    { key: "pending", header: "Awaiting reply", className: "tabular-nums", cell: (s) => s.pending },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (s) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          {select.cell(s)}
          <div>
            <p className="font-medium">{s.faculty.name}</p>
            <p className="text-xs text-muted-foreground">{s.faculty.email}</p>
          </div>
        </div>
        {actions(s)}
      </div>
      <CardFields
        fields={[
          ["Teams / capacity", load(s)],
          ["Awaiting reply", s.pending],
          ["Account", s.faculty_status === AccountStatus.ACTIVE ? "Active" : "Inactive"],
        ]}
      />
    </>
  );

  const addButton = (
    <Button onClick={() => setAdding(true)} disabled={!semesterId}>
      <Plus className="size-4" /> Add mentors
    </Button>
  );
  const headerActions = (
    <>
      <ImportButton kind="mentors" invalidate={invalidate} />
      {addButton}
    </>
  );

  return (
    <>
      <PageHeader
        title="Mentors"
        description="Who can mentor teams in each semester. Only accepted teams use a slot; when a mentor fills up, their waiting requests are declined automatically. Use Import CSV to add mentors to many semesters at once."
        actions={headerActions}
      />
      <Toolbar>
        <FilterSelect
          label="Semester"
          allLabel="Choose semester"
          value={semesterId}
          options={semesters.options}
          onChange={(v) => setParam("semester_id", v === "all" ? null : v)}
        />
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search faculty…" />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BulkDeleteButton
          selection={selection}
          noun="mentors"
          mutationFn={bulkDeleteSemesterMentors}
          invalidate={invalidate}
          description="Mentors who still have teams or pending requests this semester are skipped."
        />
      </BulkBar>
      <DataView
        columns={columns}
        rows={semesterId ? rows : []}
        renderCard={renderCard}
        loading={semesters.isLoading || (semesterId && query.isLoading)}
        error={query.error}
        onRetry={query.refetch}
        empty={
          <EmptyState
            icon={UserCheck}
            title={semesterId ? "No mentors for this semester" : "Create a semester first"}
            description="Add faculty who may mentor project teams. Their capacity defaults to the value in Settings."
            action={semesterId && addButton}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <AddMentorsDialog open={adding} onOpenChange={setAdding} semesterId={semesterId} listedIds={(rows || []).map((r) => r.faculty.id)} />
      <CapacityDialog slot={editing} onOpenChange={() => setEditing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={() => setToDelete(null)}
        title={`Remove ${toDelete?.faculty.name} from the mentor list?`}
        description="Teams can no longer choose them this semester. Blocked while they still have teams or pending requests."
        confirmLabel="Remove"
        onConfirm={() => remove.mutateAsync(toDelete)}
      />
    </>
  );
}
