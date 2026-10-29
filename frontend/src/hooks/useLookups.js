import { useQuery } from "@tanstack/react-query";
import { listSemesters } from "@/features/semesters/api";
import { listSections } from "@/features/sections/api";
import { listFaculty } from "@/features/faculty/api";
import { listSubjects } from "@/features/subjects/api";
import { listSemesterSubjects } from "@/features/mapping/api";
import { idStr } from "@/lib/ids";

// Dropdown data (page_size 200 per API.md §1). Option values are always strings (see lib/ids.js).
const ALL = { page_size: 200 };

// Common flags for "nothing to choose" UIs
const withState = (query, options) => ({
  ...query,
  options,
  isEmpty: query.isSuccess && options.length === 0,
});

export function useSemesterOptions() {
  const query = useQuery({
    queryKey: ["semesters", "options"],
    queryFn: () => listSemesters({ ...ALL, ordering: "semester_number" }),
  });
  const semesters = query.data?.results || [];
  const options = semesters.map((s) => ({ value: idStr(s.id), label: `Semester ${s.semester_number}` }));
  return { ...withState(query, options), semesters };
}

export function useSectionOptions(semesterId, { enabled = true } = {}) {
  const query = useQuery({
    queryKey: ["sections", "options", idStr(semesterId) || "all"],
    queryFn: () => listSections({ ...ALL, ordering: "name", semester_id: semesterId || undefined }),
    enabled,
  });
  const sections = query.data?.results || [];
  const options = sections.map((s) => ({
    value: idStr(s.id),
    label: semesterId ? `Section ${s.name}` : `Sem ${s.semester.semester_number} · Section ${s.name}`,
  }));
  return { ...withState(query, options), sections };
}

export function useFacultyOptions({ activeOnly = false } = {}) {
  const query = useQuery({
    queryKey: ["faculty", "options", activeOnly],
    queryFn: () => listFaculty({ ...ALL, ordering: "name", status: activeOnly ? "ACTIVE" : undefined }),
  });
  const faculty = query.data?.results || [];
  const options = faculty.map((f) => ({
    value: idStr(f.id),
    label: f.status === "ACTIVE" ? f.name : `${f.name} (inactive)`,
    disabled: f.status !== "ACTIVE",
  }));
  // Only active faculty can be assigned, so "all inactive" is effectively empty
  const hasActive = options.some((o) => !o.disabled);
  return { ...withState(query, options), hasActive, noneAssignable: query.isSuccess && !hasActive };
}

export function useSubjectOptions() {
  const query = useQuery({ queryKey: ["subjects", "options"], queryFn: () => listSubjects({ ...ALL, ordering: "code" }) });
  const options = (query.data?.results || []).map((s) => ({ value: idStr(s.id), label: `${s.code} — ${s.name}` }));
  return withState(query, options);
}

export function useOfferingOptions(semesterId) {
  const query = useQuery({
    queryKey: ["semester-subjects", "options", idStr(semesterId) || "all"],
    queryFn: () => listSemesterSubjects({ ...ALL, semester_id: semesterId || undefined }),
  });
  const offerings = query.data?.results || [];
  const options = offerings.map((o) => ({
    value: idStr(o.id),
    label: `Sem ${o.semester.semester_number} · ${o.subject.code} — ${o.subject.name}`,
  }));
  return { ...withState(query, options), offerings };
}
