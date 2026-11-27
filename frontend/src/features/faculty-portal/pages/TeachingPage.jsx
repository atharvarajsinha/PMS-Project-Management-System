import { Link } from "react-router-dom";
import { BookOpen, ChevronRight } from "lucide-react";
import DataView from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import SearchInput from "@/components/common/SearchInput";
import Toolbar from "@/components/common/Toolbar";
import { listTeaching } from "@/features/faculty-portal/api";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";

// All my section-subject teaching assignments.
export default function TeachingPage() {
  const { params, setParam } = useListParams();
  const query = usePagedList(["my", "teaching", "list"], listTeaching, params, setParam);

  const open = (t) => `/faculty/teaching/${t.id}`;
  const subject = (t) => (
    <span className="min-w-0">
      <span className="font-mono text-[13px] font-medium">{t.subject.code}</span>{" "}
      <span className="text-muted-foreground">{t.subject.name}</span>
    </span>
  );

  const columns = [
    { key: "sem", header: "Semester", className: "w-24 tabular-nums", cell: (t) => t.semester.semester_number },
    { key: "section", header: "Section", className: "w-24", cell: (t) => <span className="font-medium">{t.section.name}</span> },
    { key: "subject", header: "Subject", cell: (t) => <Link to={open(t)} className="hover:underline">{subject(t)}</Link> },
    { key: "ct", header: "Class coordinator", cell: (t) => t.class_teacher?.name || <span className="text-muted-foreground">—</span> },
    { key: "students", header: "Students", className: "w-24 tabular-nums", cell: (t) => t.students_count },
    {
      key: "open",
      header: <span className="sr-only">Open</span>,
      className: "w-12 text-right",
      cell: (t) => (
        <Link to={open(t)} className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent" aria-label={`Open ${t.subject.code} section ${t.section.name}`}>
          <ChevronRight className="size-4" />
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Teaching" description="The subjects and sections assigned to you." />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search subject or section…" />
      </Toolbar>
      <DataView
        columns={columns}
        rows={query.data?.results}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        renderCard={(t) => (
          <Link to={open(t)} className="-m-4 flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                Semester {t.semester.semester_number} · Section {t.section.name} · {t.students_count} students
              </p>
              <p className="truncate">{subject(t)}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        )}
        empty={
          <EmptyState
            icon={BookOpen}
            title={params.search ? "Nothing matches" : "No teaching assignments yet"}
            description={params.search ? "Try a different search." : "Your admin assigns you to subjects per section."}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
    </>
  );
}
