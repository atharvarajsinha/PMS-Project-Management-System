import { useState } from "react";
import { Check, Pencil, Plus, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import ImportButton from "@/features/imports/components/ImportButton";
import {
  createSpecialization,
  deleteSpecialization,
  specializationsInvalidate,
  updateSpecialization,
  useSpecializationOptions,
} from "@/features/specializations/api";
import { useApiMutation } from "@/hooks/useApiMutation";

const message = (error) => {
  const name = error?.details?.name;
  return (Array.isArray(name) ? name.join(" ") : name) || error?.message || "Something went wrong.";
};

/** Admin: the college's list of faculty specializations. Faculty pick from it; the faculty import uses it. */
export default function SpecializationsDialog({ open, onOpenChange }) {
  const { specializations, isLoading } = useSpecializationOptions();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null); // { id, name }
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);

  const opts = { invalidate: specializationsInvalidate, silentError: true };
  const create = useApiMutation((n) => createSpecialization({ name: n }), {
    ...opts,
    success: (s) => `${s.name} added`,
    onSuccess: () => setName(""),
  });
  const rename = useApiMutation((s) => updateSpecialization(s.id, { name: s.name }), {
    ...opts,
    success: "Renamed",
    onSuccess: () => setEditing(null),
  });
  const remove = useApiMutation((s) => deleteSpecialization(s.id), { invalidate: specializationsInvalidate, success: "Removed" });

  const add = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    create.mutateAsync(name.trim()).catch((err) => setError(message(err)));
  };
  const saveEdit = () => {
    if (!editing?.name.trim()) return;
    setError(null);
    rename.mutateAsync({ ...editing, name: editing.name.trim() }).catch((err) => setError(message(err)));
  };

  return (
    <>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Specializations"
        description="The list faculty pick their specializations from (e.g. AI/ML, Cyber Security). The faculty import accepts only these names."
      >
        <div className="space-y-4">
          <form onSubmit={add} className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New specialization, e.g. AI/ML" aria-label="New specialization" maxLength={100} />
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              <Plus className="size-4" /> Add
            </Button>
          </form>
          <FormError message={error} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : specializations.length ? (
            <ul className="divide-y rounded-md border">
              {specializations.map((s) => (
                <li key={s.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
                  {editing?.id === s.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editing.name}
                        maxLength={100}
                        aria-label={`Rename ${s.name}`}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveEdit();
                          } else if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                      />
                      <Button size="icon" variant="ghost" aria-label="Save" onClick={saveEdit} disabled={rename.isPending}>
                        <Check className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Cancel" onClick={() => setEditing(null)}>
                        <X className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {s.faculty_count} {s.faculty_count === 1 ? "faculty" : "faculty"}
                      </span>
                      <Button size="icon" variant="ghost" aria-label={`Rename ${s.name}`} onClick={() => setEditing({ id: s.id, name: s.name })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${s.name}`} onClick={() => setRemoving(s)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Tags} title="No specializations yet" description="Add them one by one above, or import a CSV list." />
          )}
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <ImportButton kind="specializations" />
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </FormDialog>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={() => setRemoving(null)}
        title={`Delete ${removing?.name}?`}
        description={
          removing?.faculty_count
            ? `It is removed from ${removing.faculty_count} faculty ${removing.faculty_count === 1 ? "profile" : "profiles"} too.`
            : "No faculty have it yet."
        }
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync(removing)}
      />
    </>
  );
}
