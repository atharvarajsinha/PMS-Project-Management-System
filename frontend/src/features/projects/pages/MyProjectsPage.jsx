import { useQuery } from "@tanstack/react-query";
import { FolderKanban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import { getMyProjects, projectsKey } from "@/features/projects/api";
import SubjectCard from "@/features/projects/components/SubjectCard";

export default function MyProjectsPage() {
  const query = useQuery({ queryKey: projectsKey, queryFn: getMyProjects });
  const d = query.data;

  return (
    <>
      <PageHeader
        title="My Projects"
        description={
          d
            ? `You can be in one team per subject. Teams of ${d.settings.min_team_size}–${d.settings.max_team_size}.`
            : "Your project teams, mentors and submissions."
        }
      />
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.isLoading && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}
      {d &&
        (d.subjects.length ? (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {d.subjects.map((item) => (
              <SubjectCard key={item.semester_subject.id} item={item} settings={d.settings} studentId={d.student.id} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border">
            <EmptyState icon={FolderKanban} title="No project subjects yet" description="Subjects appear here once your section is mapped to them." />
          </div>
        ))}
    </>
  );
}
