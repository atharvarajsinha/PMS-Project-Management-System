import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutGrid, Pencil, Plus, Trash2, UserCheck, UserMinus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import BulkBar from "@/components/common/BulkBar";
import BulkDeleteButton, { selectColumn } from "@/components/common/BulkDeleteButton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import SearchInput from "@/components/common/SearchInput";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect } from "@/components/common/fields";
import ClassTeacherDialog from "@/features/sections/components/ClassTeacherDialog";
import SectionFormDialog, { sectionInvalidate } from "@/features/sections/components/SectionFormDialog";
import ImportButton from "@/features/imports/components/ImportButton";
import { bulkDeleteSections, clearClassTeacher, deleteSection, listSections } from "@/features/sections/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { useSemesterOptions } from "@/hooks/useLookups";
import { usePagedList } from "@/hooks/usePagedList";
import { useSelection } from "@/hooks/useSelection";

const CT_FILTER = [
  { value: "true", label: "Has class coordinator" },
  { value: "false", label: "No class coordinator" },
];

export default function SectionsPage() {
  const navigate = useNavigate();
  const { params, setParam } = useListParams({ ordering: "name" });
  const [form, setForm] = useState({ open: false, section: null });
  const [ctSection, setCtSection] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: "delete" | "clear-ct", section }
  const semesters = useSemesterOptions();

  const query = usePagedList(["sections", "list"], listSections, params, setParam);
  const remove = useApiMutation((s) => deleteSection(s.id), { invalidate: sectionInvalidate, success: "Section deleted" });
  const clearCt = useApiMutation((s) => clearClassTeacher(s.id), { invalidate: sectionInvalidate, success: "Class coordinator removed" });

  const label = (s) => `Semester ${s.semester.semester_number} · Section ${s.name}`;
  const selection = useSelection();
  const select = selectColumn(selection, query.data?.results, label);

  const actions = (s) => (
    <RowActions
      label={`Actions for ${label(s)}`}
      items={[
        { label: s.class_teacher ? "Change class coordinator" : "Assign class coordinator", icon: UserCheck, onSelect: () => setCtSection(s) },
        { label: "Remove class coordinator", icon: UserMinus, hidden: !s.class_teacher, onSelect: () => setConfirm({ type: "clear-ct", section: s }) },
        { label: "View students", icon: Users, onSelect: () => navigate(`/admin/students?semester_id=${s.semester.id}&section_id=${s.id}`) },
        { label: "Rename", icon: Pencil, onSelect: () => setForm({ open: true, section: s }) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirm({ type: "delete", section: s }) },
      ]}
    />
  );

  const subjects = (s) =>
    s.subjects.length ? (
      <div className="flex flex-wrap gap-1">
        {s.subjects.map((sub) => (
          <span
            key={sub.section_subject_id}
            title={sub.faculty ? `${sub.subject_name} — ${sub.faculty.name}` : `${sub.subject_name} — no faculty`}
            className={
              sub.faculty
                ? "rounded-full border px-2 py-0.5 font-mono text-[12px]"
                : "rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 font-mono text-[12px] text-warning"
            }
          >
            {sub.subject_code}
          </span>
        ))}
      </div>
    ) : (
      <span className="text-muted-foreground">None</span>
    );

  const teacher = (s) =>
    s.class_teacher ? (
      <div className="min-w-0">
        <p className="truncate">{s.class_teacher.name}</p>
        <p className="truncate text-xs text-muted-foreground">{s.class_teacher.email}</p>
      </div>
    ) : (
      <Button variant="link" className="h-auto min-h-0 p-0" onClick={() => setCtSection(s)}>
        Assign
      </Button>
    );

  const columns = [
    select,
    { key: "sem", header: "Semester", className: "w-24 tabular-nums", cell: (s) => s.semester.semester_number },
    { key: "name", header: "Section", className: "w-24", cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "ct", header: "Class coordinator", cell: teacher },
    { key: "students", header: "Students", className: "tabular-nums", cell: (s) => s.students_count },
    { key: "subjects", header: "Subjects", cell: subjects },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (s) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {select.cell(s)}
          <p className="font-medium">{label(s)}</p>
        </div>
        {actions(s)}
      </div>
      <CardFields
        fields={[
          ["Class coordinator", s.class_teacher?.name || "Not assigned"],
          ["Students", s.students_count],
        ]}
      />
      <div className="mt-3">{subjects(s)}</div>
    </>
  );

  const cs = confirm?.section;
  const filtered = params.search || params.semester_id || params.has_class_teacher;

  return (
    <>
      <PageHeader
        title="Sections & Class Coordinators"
        description="Sections belong to a semester. Each can have one class coordinator. Subjects in amber have no faculty yet."
        actions={
          <>
            <ImportButton kind="sections" />
            <Button onClick={() => setForm({ open: true, section: null })}>
              <Plus className="size-4" /> New section
            </Button>
          </>
        }
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search section name…" />
        <FilterSelect label="Semester" value={params.semester_id} onChange={(v) => setParam("semester_id", v)} options={semesters.options} loading={semesters.isLoading} emptyText="No semesters yet — create one under Semesters" allLabel="All semesters" />
        <FilterSelect
          label="Class coordinator"
          value={params.has_class_teacher}
          onChange={(v) => setParam("has_class_teacher", v)}
          options={CT_FILTER}
          allLabel="Any class coordinator"
          className="sm:w-48"
        />
      </Toolbar>
      <BulkBar count={selection.count} onClear={selection.clear}>
        <BulkDeleteButton
          selection={selection}
          noun={selection.count === 1 ? "section" : "sections"}
          mutationFn={bulkDeleteSections}
          invalidate={sectionInvalidate}
          description="Their subject mappings and class coordinator assignments are removed too. Sections that still have students are skipped."
        />
      </BulkBar>
      <DataView
        columns={columns}
        rows={query.data?.results}
        renderCard={renderCard}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={
          <EmptyState
            icon={LayoutGrid}
            title={filtered ? "No sections match" : "No sections yet"}
            description={filtered ? "Try a different search or filter." : "Create sections inside a semester."}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <SectionFormDialog
        open={form.open}
        section={form.section}
        defaultSemesterId={params.semester_id}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
      />
      <ClassTeacherDialog section={ctSection} onOpenChange={(open) => !open && setCtSection(null)} />
      <ConfirmDialog
        open={confirm?.type === "clear-ct"}
        onOpenChange={() => setConfirm(null)}
        title={`Remove class coordinator of ${cs ? label(cs) : ""}?`}
        description={`${cs?.class_teacher?.name} will no longer be class coordinator of this section.`}
        confirmLabel="Remove"
        onConfirm={() => clearCt.mutateAsync(cs)}
      />
      <ConfirmDialog
        open={confirm?.type === "delete"}
        onOpenChange={() => setConfirm(null)}
        title={`Delete ${cs ? label(cs) : ""}?`}
        description="This also removes its subject mappings. It's blocked while the section still has students — move or delete them first. This cannot be undone."
        confirmText={cs?.name}
        onConfirm={() => remove.mutateAsync(cs)}
      />
    </>
  );
}
