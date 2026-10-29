import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SelectEmpty } from "@/components/common/fields";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useFacultyOptions } from "@/hooks/useLookups";
import { assignSectionSubjectFaculty, mappingInvalidate } from "@/features/mapping/api";
import { apiId, idStr, sameId } from "@/lib/ids";
import { cn } from "@/lib/utils";

// Inline faculty assignment for one section-subject (PATCH, null = unassign).
export default function FacultyPicker({ sectionSubject, className }) {
  const faculty = useFacultyOptions();
  const mutation = useApiMutation((facultyId) => assignSectionSubjectFaculty(sectionSubject.id, apiId(facultyId)), {
    invalidate: mappingInvalidate,
    success: (r) => (r.faculty ? `${r.faculty.name} assigned to ${r.subject.code} · ${r.section.name}` : "Faculty unassigned"),
  });

  const assigned = sectionSubject.faculty;
  const current = assigned ? idStr(assigned.id) : "__none";
  // Keep the current assignee visible even if they're inactive or not in the list
  const options =
    !assigned || faculty.options.some((o) => sameId(o.value, assigned.id))
      ? faculty.options
      : [{ value: idStr(assigned.id), label: assigned.name, disabled: true }, ...faculty.options];

  return (
    <div className="flex w-full items-center gap-2">
      <Select value={current} onValueChange={(v) => mutation.mutate(v === "__none" ? null : v)} disabled={mutation.isPending}>
        <SelectTrigger
          className={cn("h-9 w-full sm:w-56", !assigned && "border-warning/40 text-warning", className)}
          aria-label={`Faculty for ${sectionSubject.subject.code}, section ${sectionSubject.section.name}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Unassigned</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
          {(faculty.isLoading || faculty.noneAssignable) && (
            <SelectEmpty loading={faculty.isLoading} text="No active faculty yet. Add or activate faculty on the Faculty page." />
          )}
        </SelectContent>
      </Select>
      {mutation.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}
    </div>
  );
}
