import { useState } from "react";
import { Network, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import SearchInput from "@/components/common/SearchInput";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect } from "@/components/common/fields";
import FacultyPicker from "@/features/mapping/components/FacultyPicker";
import ImportButton from "@/features/imports/components/ImportButton";
import MappingGrid from "@/features/mapping/components/MappingGrid";
import { deleteSectionSubject, listSectionSubjects, mappingInvalidate } from "@/features/mapping/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useFacultyOptions, useSectionOptions, useSemesterOptions, useSubjectOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";

const TABS = [
  { value: "grid", label: "By semester" },
  { value: "list", label: "All mappings" },
];

const subjectCell = (subject) => (
  <span className="min-w-0">
    <span className="font-mono text-[13px] font-medium">{subject.code}</span> <span className="text-muted-foreground">{subject.name}</span>
  </span>
);

function MappingListTab({ params, setParam, setParams }) {
  const [toDelete, setToDelete] = useState(null);
  const semesters = useSemesterOptions();
  const sections = useSectionOptions(params.semester_id);
  const subjects = useSubjectOptions();
  const faculty = useFacultyOptions();

  const filters = {
    page: params.page,
    search: params.search,
    semester_id: params.semester_id,
    section_id: params.section_id,
    subject_id: params.subject_id,
    faculty_id: params.faculty_id,
    unassigned: params.unassigned,
  };
  const query = usePagedList(["section-subjects", "list"], listSectionSubjects, filters, setParam);
  const remove = useApiMutation((s) => deleteSectionSubject(s.id), { invalidate: mappingInvalidate, success: "Mapping removed" });

  const actions = (s) => (
    <RowActions
      label={`Actions for ${s.subject.code} section ${s.section.name}`}
      items={[{ label: "Remove mapping", icon: Trash2, destructive: true, onSelect: () => setToDelete(s) }]}
    />
  );

  const facultyCell = (s) => <FacultyPicker sectionSubject={s} />;

  const columns = [
    { key: "sem", header: "Semester", className: "w-24 tabular-nums", cell: (s) => s.semester.semester_number },
    { key: "section", header: "Section", className: "w-24", cell: (s) => <span className="font-medium">{s.section.name}</span> },
    { key: "subject", header: "Subject", cell: (s) => subjectCell(s.subject) },
    { key: "faculty", header: "Faculty", cell: facultyCell },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  return (
    <>
      <Toolbar>
        <SearchInput
          value={params.search}
          onChange={(v) => setParam("search", v)}
          placeholder="Search subject, section, faculty…"
        />
        <FilterSelect
          label="Semester"
          value={params.semester_id}
          onChange={(v) => setParams({ semester_id: v, section_id: null })}
          options={semesters.options} loading={semesters.isLoading} emptyText="No semesters yet — create one under Semesters"
          allLabel="All semesters"
          className="sm:w-40"
        />
        <FilterSelect label="Section" value={params.section_id} onChange={(v) => setParam("section_id", v)} options={sections.options} loading={sections.isLoading} emptyText={params.semester_id ? "No sections in this semester yet" : "No sections yet — create one under Sections"} allLabel="All sections" className="sm:w-48" />
        <FilterSelect label="Subject" value={params.subject_id} onChange={(v) => setParam("subject_id", v)} options={subjects.options} loading={subjects.isLoading} emptyText="No subjects yet — add one under Subjects" allLabel="All subjects" className="sm:w-56" />
            <FilterSelect
              label="Faculty"
              value={params.faculty_id}
              onChange={(v) => setParam("faculty_id", v)}
              options={faculty.options} loading={faculty.isLoading} emptyText="No faculty yet — add one under Faculty"
              allLabel="All faculty"
              className="sm:w-48"
            />
            <FilterSelect
              label="Assignment"
              value={params.unassigned}
              onChange={(v) => setParam("unassigned", v)}
              options={[{ value: "true", label: "Unassigned only" }]}
              allLabel="All assignments"
              className="sm:w-44"
            />
      </Toolbar>
      <DataView
        columns={columns}
        rows={query.data?.results}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        renderCard={(s) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Semester {s.semester.semester_number} · Section {s.section.name}
                </p>
                <p className="truncate">{subjectCell(s.subject)}</p>
              </div>
              {actions(s)}
            </div>
            <div className="mt-3">{facultyCell(s)}</div>
          </>
        )}
        empty={
          <EmptyState
            icon={Network}
            title={params.search ? "No mappings match" : params.unassigned ? "Everything is assigned" : "No section mappings"}
            description={
              params.search
                ? "Try a different search or filter."
                : params.unassigned
                  ? "Every mapped section has a faculty member."
                  : "Map subjects to sections in the By semester tab to see them here."
            }
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={() => setToDelete(null)}
        title={`Remove ${toDelete?.subject.code} from section ${toDelete?.section.name}?`}
        description="The section will no longer take this subject, and its faculty assignment is removed."
        confirmLabel="Remove"
        onConfirm={() => remove.mutateAsync(toDelete)}
      />
    </>
  );
}

export default function MappingPage() {
  const { params, setParam, setParams } = useListParams({ tab: "grid" });

  // Switching tabs keeps semester but drops search, list filters and the page
  const changeTab = (tab) => setParams({ tab, search: null, section_id: null, subject_id: null, faculty_id: null, unassigned: null });

  return (
    <>
      <PageHeader
        title="Subject Mapping"
        description="Pick a semester, add its subjects, then map each to sections and choose who teaches it."
        actions={<ImportButton kind="subject-mappings" />}
      />
      <Tabs value={params.tab} onValueChange={changeTab}>
        <div className="relative mb-6 overflow-x-auto">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="grid">
          <MappingGrid semesterId={params.semester_id} onSemesterChange={(v) => setParam("semester_id", v)} />
        </TabsContent>
        <TabsContent value="list">
          <MappingListTab params={params} setParam={setParam} setParams={setParams} />
        </TabsContent>
      </Tabs>
    </>
  );
}
