import { useQuery } from "@tanstack/react-query";
import { LayoutGrid } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import ClassSectionCard from "@/features/faculty-portal/components/ClassSectionCard";
import { getFacultyDashboard } from "@/features/faculty-portal/api";

// Sections where I'm class coordinator (usually one per semester). Uses the dashboard payload,
// which already carries per-section student and inactive counts.
export default function ClassesPage() {
  const query = useQuery({ queryKey: ["my", "dashboard"], queryFn: getFacultyDashboard });
  const sections = query.data?.class_sections;

  return (
    <>
      <PageHeader title="My classes" description="Sections where you are the class coordinator. Open one to manage its students." />
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : sections.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
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
        <div className="rounded-lg border">
          <EmptyState
            icon={LayoutGrid}
            title="You're not a class coordinator yet"
            description="When your admin makes you class coordinator of a section, it appears here and you can manage its students."
          />
        </div>
      )}
    </>
  );
}
