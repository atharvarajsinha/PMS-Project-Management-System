import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, CalendarRange, FolderKanban, Mail, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeader from "@/components/common/PageHeader";
import StatTile from "@/components/common/StatTile";
import { PhaseStatus as PS, SubmissionStatus } from "@/config/choices";
import MemberOverview from "@/features/dashboard/components/MemberOverview";
import { getMyProjects, projectsKey } from "@/features/projects/api";
import { PhaseStatus, SubmissionState } from "@/features/teams/components/TeamBits";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";

export default function StudentDashboard() {
  const { user } = useAuth();
  const st = user.student;
  const projects = useQuery({ queryKey: projectsKey, queryFn: getMyProjects });
  const subjects = projects.data?.subjects || [];
  const teams = subjects.filter((s) => s.team).length;
  const invites = subjects.reduce((n, s) => n + (s.team ? 0 : s.invites.length), 0);

  // Open phases (and the next upcoming ones) of subjects where I'm in a team
  const deadlines = subjects
    .flatMap((s) => s.phases.filter((p) => p.status === PS.OPEN || p.status === PS.UPCOMING).map((p) => ({ ...p, subject: s.semester_subject.subject, hasTeam: !!s.team })))
    .sort((a, b) => a.end_date.localeCompare(b.end_date))
    .slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={
          <>
            {user.college?.name} · <span className="font-mono text-[13px]">{st?.roll_number}</span>
          </>
        }
        actions={
          <Button asChild>
            <Link to="/student/projects">
              My Projects <ArrowRight className="size-4" />
            </Link>
          </Button>
        }
      />
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label="Semester · Section" value={st ? `${st.semester?.semester_number} · ${st.section?.name}` : null} icon={CalendarRange} />
          <StatTile label="Project subjects" value={subjects.length} icon={FolderKanban} loading={projects.isLoading} />
          <StatTile label="Teams joined" value={`${teams}/${subjects.length}`} icon={UsersRound} loading={projects.isLoading} />
          <StatTile label="Pending invites" value={invites} icon={Mail} loading={projects.isLoading} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" aria-hidden /> Phase deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {deadlines.length ? (
                <ul className="divide-y">
                  {deadlines.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <div>
                        <p className="font-medium">
                          {p.subject.code} · {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.status === PS.OPEN ? `Closes ${formatDate(p.end_date)}` : `Opens ${formatDate(p.start_date)}`}
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        <PhaseStatus status={p.status} />
                        {p.status === PS.OPEN && p.hasTeam && p.submission?.status !== SubmissionStatus.SUBMITTED && <SubmissionState submission={p.submission} />}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{projects.isLoading ? "Loading…" : "No open or upcoming phases."}</p>
              )}
            </CardContent>
          </Card>
          <MemberOverview />
        </div>
      </div>
    </>
  );
}
