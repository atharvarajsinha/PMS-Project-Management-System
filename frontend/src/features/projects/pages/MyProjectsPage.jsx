import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Carousel from "@/components/common/Carousel";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import { getMyProjects, projectsKey } from "@/features/projects/api";
import SubjectCard from "@/features/projects/components/SubjectCard";
import { sameId } from "@/lib/ids";

/** One project (subject) at a time; the tabs above switch between them. */
export default function MyProjectsPage() {
  const query = useQuery({ queryKey: projectsKey, queryFn: getMyProjects });
  const d = query.data;
  const [search, setSearch] = useSearchParams();
  const [fallback, setFallback] = useState(0);
  const subjects = d?.subjects || [];
  // The chosen subject is kept in the address (?subject=<id>) so a refresh stays on it
  const fromUrl = subjects.findIndex((s) => sameId(s.semester_subject.id, search.get("subject")));
  const index = fromUrl >= 0 ? fromUrl : fallback;
  const choose = (i) => {
    setFallback(i);
    const next = new URLSearchParams(search);
    next.set("subject", String(subjects[i].semester_subject.id));
    setSearch(next, { replace: true });
  };

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
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      )}
      {d &&
        (subjects.length ? (
          <Carousel
            label="Projects"
            items={subjects}
            index={index}
            onIndexChange={choose}
            itemKey={(item) => item.semester_subject.id}
            tabLabel={(item) => (
              <span className="flex flex-col leading-tight">
                <span className="font-medium">{item.semester_subject.subject.code}</span>
                <span className="max-w-[12rem] truncate text-xs text-muted-foreground">
                  {item.team ? item.team.project_title || item.team.display_name : "No team yet"}
                </span>
              </span>
            )}
            renderItem={(item) => <SubjectCard item={item} settings={d.settings} studentId={d.student.id} />}
          />
        ) : (
          <div className="rounded-lg border">
            <EmptyState icon={FolderKanban} title="No project subjects yet" description="Subjects appear here once your section is mapped to them." />
          </div>
        ))}
    </>
  );
}
