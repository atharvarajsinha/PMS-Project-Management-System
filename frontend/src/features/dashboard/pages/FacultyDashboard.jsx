import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, LayoutGrid, UserCheck, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import StatTile from "@/components/common/StatTile";
import MemberOverview from "@/features/dashboard/components/MemberOverview";
import ClassSectionCard from "@/features/faculty-portal/components/ClassSectionCard";
import { getFacultyDashboard } from "@/features/faculty-portal/api";
import { useAuth } from "@/context/AuthContext";

// Teaching rows grouped by semester, in the API's order (semester → subject → section)
function groupBySemester(rows) {
  const groups = new Map();
  rows.forEach((t) => {
    if (!groups.has(t.semester_number)) groups.set(t.semester_number, []);
    groups.get(t.semester_number).push(t);
  });
  return [...groups.entries()];
}

function SectionHeading({ title, to, linkLabel }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {to && (
        <Link to={to} className="text-sm text-primary underline-offset-4 hover:underline">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}

export default function FacultyDashboard() {
  const { user } = useAuth();
  const query = useQuery({ queryKey: ["my", "dashboard"], queryFn: getFacultyDashboard, refetchOnMount: "always" });
  const d = query.data;
  const loading = query.isLoading;

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description={user.college?.name} />
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <div className="space-y-8">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Class sections" value={d?.counts.class_sections} icon={LayoutGrid} loading={loading} />
            <StatTile label="Students in my classes" value={d?.counts.class_students} icon={Users} loading={loading} />
            <StatTile label="Subjects I teach" value={d?.counts.teaching_subjects} icon={BookOpen} loading={loading} />
            <StatTile label="Sections I teach" value={d?.counts.teaching_assignments} icon={UserCheck} loading={loading} />
          </div>

          <section>
            <SectionHeading title="My class sections" to={d?.class_sections.length > 1 ? "/faculty/classes" : undefined} linkLabel="View all" />
            {loading ? (
              <Skeleton className="h-32 w-full" />
            ) : d.class_sections.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {d.class_sections.map((s) => (
                  <ClassSectionCard
                    key={s.section_id}
                    sectionId={s.section_id}
                    semesterNumber={s.semester_number}
                    sectionName={s.section_name}
                    studentsCount={s.students_count}
                    inactiveCount={s.inactive_students}
                    subjectsCount={s.subjects_count}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border bg-card">
                <EmptyState
                  icon={LayoutGrid}
                  title="You're not a class coordinator"
                  description="If your admin makes you class coordinator of a section, you'll manage its students from here."
                />
              </div>
            )}
          </section>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section>
              <SectionHeading title="My teaching" to={d?.teaching.length ? "/faculty/teaching" : undefined} linkLabel="Open list" />
              {loading ? (
                <Skeleton className="h-40 w-full" />
              ) : d.teaching.length ? (
                <div className="space-y-4">
                  {groupBySemester(d.teaching).map(([semester, rows]) => (
                    <div key={semester} className="rounded-lg border bg-card">
                      <p className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Semester {semester}
                      </p>
                      <ul className="divide-y">
                        {rows.map((t) => (
                          <li key={t.section_subject_id}>
                            <Link
                              to={`/faculty/teaching/${t.section_subject_id}`}
                              className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-accent/50"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="font-mono text-[13px] font-medium">{t.subject_code}</span>{" "}
                                <span className="text-muted-foreground">{t.subject_name}</span>
                              </span>
                              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">Section {t.section_name}</span>
                              <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
                                {t.students_count} students
                              </span>
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border bg-card">
                  <EmptyState
                    icon={BookOpen}
                    title="No teaching assignments yet"
                    description="Your admin assigns you to subjects per section. They'll show up here."
                  />
                </div>
              )}
            </section>
            <div>
              <MemberOverview />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
