import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserCheck, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import SearchInput from "@/components/common/SearchInput";
import StatusBadge from "@/components/common/StatusBadge";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect, STATUS_OPTIONS } from "@/components/common/fields";
import { BackLink, PortalLoadError, sectionLabel } from "@/features/faculty-portal/components/PortalBits";
import { getTeaching, listTeachingStudents } from "@/features/faculty-portal/api";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { formatDate } from "@/lib/utils";

// One subject I teach in one section: details and the section's students (read-only).
export default function TeachingDetailPage() {
  const { id } = useParams();
  const { params, setParam } = useListParams({ ordering: "roll_number" });

  const teaching = useQuery({ queryKey: ["my", "teaching", "detail", id], queryFn: () => getTeaching(id) });
  const query = usePagedList(["my", "teaching-students", id], (p) => listTeachingStudents(id, p), params, setParam);
  const t = teaching.data;

  if (teaching.error) {
    return (
      <>
        <BackLink to="/faculty/teaching">Teaching</BackLink>
        <PortalLoadError error={teaching.error} onRetry={teaching.refetch} what="Teaching assignment" />
      </>
    );
  }

  const columns = [
    { key: "roll", header: "Roll no.", className: "w-32", cell: (s) => <span className="font-mono text-[13px] font-medium">{s.roll_number}</span> },
    { key: "name", header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: "email", header: "Email", cell: (s) => <span className="text-muted-foreground">{s.email}</span> },
    { key: "status", header: "Status", className: "w-28", cell: (s) => <StatusBadge status={s.status} /> },
  ];

  const filtered = params.search || params.status;

  return (
    <>
      <BackLink to="/faculty/teaching">Teaching</BackLink>
      <PageHeader
        title={t ? `${t.subject.code} · ${t.subject.name}` : "Teaching assignment"}
        description={t ? sectionLabel(t.semester.semester_number, t.section.name) : undefined}
      />

      {teaching.isLoading ? (
        <Skeleton className="mb-6 h-24 w-full" />
      ) : (
        t && (
          <dl className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-border/80 bg-card shadow-soft p-4">
              <dt className="text-xs text-muted-foreground">Students</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{t.students_count}</dd>
            </div>
            <div className="rounded-[1.25rem] border border-border/80 bg-card shadow-soft p-4">
              <dt className="text-xs text-muted-foreground">Class coordinator</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm font-medium">
                <UserCheck className="size-4 text-muted-foreground" aria-hidden />
                {t.class_teacher ? t.class_teacher.name : <span className="text-muted-foreground">Not assigned</span>}
              </dd>
              {t.class_teacher && <dd className="truncate text-xs text-muted-foreground">{t.class_teacher.email}</dd>}
            </div>
            <div className="rounded-[1.25rem] border border-border/80 bg-card shadow-soft p-4">
              <dt className="text-xs text-muted-foreground">Assigned to you</dt>
              <dd className="mt-1 text-sm font-medium">
                {formatDate(t.faculty_assigned_at)}
              </dd>
            </div>
          </dl>
        )
      )}

      <h2 className="mb-3 text-lg font-semibold">Students</h2>
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search name, email, roll no…" />
        <FilterSelect label="Status" value={params.status} onChange={(v) => setParam("status", v)} options={STATUS_OPTIONS} allLabel="All statuses" className="sm:w-36" />
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
                <p className="truncate font-medium">{s.name}</p>
                <p className="font-mono text-[13px] text-muted-foreground">{s.roll_number}</p>
              </div>
              <StatusBadge status={s.status} />
            </div>
            <CardFields fields={[["Email", s.email]]} />
          </>
        )}
        empty={
          <EmptyState
            icon={Users}
            title={filtered ? "No students match" : "No students in this section yet"}
            description={filtered ? "Try a different search or filter." : "The section's class coordinator or your admin adds students."}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />
    </>
  );
}
