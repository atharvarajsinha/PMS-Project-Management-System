import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Network, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import RowActions from "@/components/common/RowActions";
import { SelectEmpty } from "@/components/common/fields";
import FacultyPicker from "@/features/mapping/components/FacultyPicker";
import {
  bulkCreateSectionSubjects,
  createSemesterSubject,
  deleteSectionSubject,
  deleteSemesterSubject,
  listSemesterSubjects,
  mappingInvalidate,
} from "@/features/mapping/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useSectionOptions, useSemesterOptions, useSubjectOptions } from "@/hooks/useLookups";
import { apiId, idStr, sameId } from "@/lib/ids";

/**
 * One semester on one screen: rows are the subjects offered in it, columns are its sections.
 * A cell is either "+ Map" (section doesn't take the subject) or the faculty who teaches it.
 */
export default function MappingGrid({ semesterId: selected, onSemesterChange }) {
  const [toRemove, setToRemove] = useState(null); // { kind: "offering" | "mapping", ... }
  const semesters = useSemesterOptions();
  const semesterId = selected || semesters.options[0]?.value || "";
  const semester = semesters.semesters.find((s) => sameId(s.id, semesterId));

  const sections = useSectionOptions(semesterId, { enabled: !!semesterId });
  const subjects = useSubjectOptions();
  const offeringsQuery = useQuery({
    queryKey: ["semester-subjects", "grid", idStr(semesterId)],
    queryFn: () => listSemesterSubjects({ semester_id: semesterId, page_size: 200 }),
    enabled: !!semesterId,
  });
  const offerings = offeringsQuery.data?.results || [];

  const offered = useMemo(() => new Set(offerings.map((o) => idStr(o.subject.id))), [offerings]);
  const unoffered = subjects.options.filter((o) => !offered.has(o.value));

  const offer = useApiMutation((subjectId) => createSemesterSubject({ semester_id: apiId(semesterId), subject_id: apiId(subjectId) }), {
    invalidate: mappingInvalidate,
    success: (o) => `${o.subject.code} offered in Semester ${o.semester.semester_number}`,
  });
  const map = useApiMutation(({ offering, sectionIds }) =>
    bulkCreateSectionSubjects({
      semester_subject_id: offering.id,
      items: sectionIds.map((id) => ({ section_id: apiId(id), faculty_id: null })),
    }), {
    invalidate: mappingInvalidate,
    onSuccess: (res, { offering }) => {
      if (res.failed.length) toast.warning(`${res.created.length} mapped, ${res.failed.length} failed`, { description: res.failed.map((f) => f.message).join(" · ") });
      else toast.success(`${offering.subject.code} mapped to ${res.created.length} section${res.created.length === 1 ? "" : "s"}`, { duration: 3000 });
    },
  });
  const removeMapping = useApiMutation((m) => deleteSectionSubject(m.id), { invalidate: mappingInvalidate, success: "Mapping removed" });
  const removeOffering = useApiMutation((o) => deleteSemesterSubject(o.id), { invalidate: mappingInvalidate, success: "Subject removed from semester" });

  const mappingCount = offerings.reduce((n, o) => n + o.sections.length, 0);
  const unassignedCount = offerings.reduce((n, o) => n + o.sections.filter((s) => !s.faculty).length, 0);

  if (semesters.isSuccess && !semesters.options.length) {
    return <EmptyState icon={Network} title="No semesters yet" description="Create a semester and its sections first, then map subjects here." />;
  }

  const cell = (offering, section) => {
    const mapping = offering.sections.find((s) => sameId(s.section_id, section.id));
    if (!mapping) {
      const pending = map.isPending && map.variables?.offering.id === offering.id && map.variables.sectionIds.includes(idStr(section.id));
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full border-dashed text-muted-foreground"
          disabled={map.isPending}
          onClick={() => map.mutate({ offering, sectionIds: [idStr(section.id)] })}
          aria-label={`Map ${offering.subject.code} to section ${section.name}`}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Map
        </Button>
      );
    }
    const sectionSubject = { id: mapping.section_subject_id, faculty: mapping.faculty, subject: offering.subject, section: { name: section.name } };
    return (
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <FacultyPicker sectionSubject={sectionSubject} className="sm:w-full" />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={() => setToRemove({ kind: "mapping", item: sectionSubject })}
          aria-label={`Remove ${offering.subject.code} from section ${section.name}`}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  };

  const rowActions = (offering) => {
    const free = sections.sections.filter((s) => !offering.sections.some((m) => sameId(m.section_id, s.id)));
    return (
      <RowActions
        label={`Actions for ${offering.subject.code}`}
        items={[
          ...(free.length
            ? [{ label: "Map to all sections", icon: Network, onSelect: () => map.mutate({ offering, sectionIds: free.map((s) => idStr(s.id)) }) }, "separator"]
            : []),
          { label: "Remove from semester", icon: Trash2, destructive: true, onSelect: () => setToRemove({ kind: "offering", item: offering }) },
        ]}
      />
    );
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={idStr(semesterId)} onValueChange={onSemesterChange}>
            <SelectTrigger className="w-full sm:w-44" aria-label="Semester">
              <SelectValue placeholder="Choose semester" />
            </SelectTrigger>
            <SelectContent>
              {semesters.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
              {semesters.isLoading && <SelectEmpty loading />}
            </SelectContent>
          </Select>
          <Select value="" onValueChange={(v) => offer.mutate(v)} disabled={!semesterId || offer.isPending}>
            <SelectTrigger className="w-full sm:w-64" aria-label="Add a subject to this semester">
              <SelectValue placeholder={offer.isPending ? "Adding…" : "+ Add subject to semester"} />
            </SelectTrigger>
            <SelectContent>
              {unoffered.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
              {!unoffered.length && (
                <SelectEmpty
                  loading={subjects.isLoading}
                  text={subjects.options.length ? "Every subject is already offered here" : "No subjects yet — add one under Subjects"}
                />
              )}
            </SelectContent>
          </Select>
        </div>
        {offerings.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {offerings.length} subject{offerings.length === 1 ? "" : "s"} · {mappingCount} mapping{mappingCount === 1 ? "" : "s"}
            {unassignedCount > 0 && <span className="text-warning"> · {unassignedCount} without faculty</span>}
          </p>
        )}
      </div>

      {offeringsQuery.error ? (
        <ErrorState error={offeringsQuery.error} onRetry={offeringsQuery.refetch} />
      ) : offeringsQuery.isLoading || sections.isLoading || semesters.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : !sections.sections.length ? (
        <EmptyState icon={Network} title={`Semester ${semester?.semester_number ?? ""} has no sections`} description="Create sections under Sections & Class Teachers, then map subjects to them here." />
      ) : !offerings.length ? (
        <EmptyState icon={Network} title="No subjects in this semester" description="Use “Add subject to semester” above, then map it to sections and pick who teaches each." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th scope="col" className="sticky left-0 z-10 bg-card px-4 py-3 font-medium">Subject</th>
                {sections.sections.map((s) => (
                  <th key={s.id} scope="col" className="min-w-56 px-3 py-3 font-medium">
                    Section {s.name}
                  </th>
                ))}
                <th scope="col" className="w-12 px-2 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {offerings.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-normal">
                    <span className="block font-mono text-[13px] font-medium">{o.subject.code}</span>
                    <span className="block max-w-48 truncate text-xs text-muted-foreground" title={o.subject.name}>
                      {o.subject.name}
                    </span>
                  </th>
                  {sections.sections.map((s) => (
                    <td key={s.id} className="px-3 py-3 align-middle">
                      {cell(o, s)}
                    </td>
                  ))}
                  <td className="px-2 py-3 text-right">{rowActions(o)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={() => setToRemove(null)}
        title={
          toRemove?.kind === "offering"
            ? `Remove ${toRemove.item.subject.code} from Semester ${toRemove.item.semester.semester_number}?`
            : `Remove ${toRemove?.item.subject.code} from section ${toRemove?.item.section.name}?`
        }
        description={
          toRemove?.kind === "offering"
            ? "This also removes its section mappings and faculty assignments. This cannot be undone."
            : "The section will no longer take this subject, and its faculty assignment is removed."
        }
        confirmLabel="Remove"
        confirmText={toRemove?.kind === "offering" ? toRemove.item.subject.code : undefined}
        onConfirm={() => (toRemove.kind === "offering" ? removeOffering.mutateAsync(toRemove.item) : removeMapping.mutateAsync(toRemove.item))}
      />
    </>
  );
}
