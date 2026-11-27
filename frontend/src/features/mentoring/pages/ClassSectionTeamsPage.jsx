import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Crown, Eye, UsersRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import EmptyState from "@/components/common/EmptyState";
import PageHeader from "@/components/common/PageHeader";
import SearchInput from "@/components/common/SearchInput";
import StatusBadge from "@/components/common/StatusBadge";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect } from "@/components/common/fields";
import { MentorStatus, TeamRole } from "@/config/choices";
import { BackLink, PortalLoadError, sectionLabel } from "@/features/faculty-portal/components/PortalBits";
import { getClassSectionTeams } from "@/features/mentoring/api";
import StudentProjectDialog from "@/features/mentoring/components/StudentProjectDialog";
import { Button } from "@/components/ui/button";
import { useIsDesktop } from "@/hooks/useMediaQuery";

/** One student × one subject: team, role, mentor and evaluator per phase. */
function TeamCell({ cell }) {
  if (!cell) return <StatusBadge status="PENDING" label="No team" />;
  const evaluators = [...new Set(cell.evaluators.map((e) => e.evaluator?.name || "Pending"))];
  return (
    <div className="space-y-0.5 text-sm">
      <p className="flex items-center gap-1.5 font-medium">
        {cell.role === TeamRole.LEAD && <Crown className="size-3.5 text-primary" aria-label="Team Lead" />}
        {cell.display_name}
        {!cell.is_complete && <StatusBadge status="PENDING" label="Too small" />}
      </p>
      <p className="text-xs text-muted-foreground">
        {cell.members_count} members{cell.role === TeamRole.MEMBER && ` · lead ${cell.lead}`}
      </p>
      <p className="text-xs">
        <span className="text-muted-foreground">Mentor: </span>
        {cell.mentors.length
          ? cell.mentors.map((m) => `${m.name}${m.status === MentorStatus.PENDING ? " (pending)" : ""}`).join(", ")
          : "—"}
      </p>
      <p className="text-xs">
        <span className="text-muted-foreground">Evaluated by: </span>
        {cell.evaluators.length ? evaluators.join(", ") : "—"}
      </p>
    </div>
  );
}

const FILTERS = [
  { value: "without", label: "Without a team" },
  { value: "with", label: "In a team" },
];

// Class coordinator add-on: where every student of my section stands, per subject.
export default function ClassSectionTeamsPage() {
  const { sectionId } = useParams();
  const isDesktop = useIsDesktop();
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState(null);
  const [filter, setFilter] = useState(null);
  const [details, setDetails] = useState(null); // student whose marks dialog is open
  const query = useQuery({ queryKey: ["my", "class-section-teams", sectionId], queryFn: () => getClassSectionTeams(sectionId) });
  const d = query.data;

  if (query.error) {
    return (
      <>
        <BackLink to="/faculty/classes">My Classes</BackLink>
        <PortalLoadError error={query.error} onRetry={query.refetch} what="Section" />
      </>
    );
  }

  const subjects = d ? (subjectId ? d.subjects.filter((s) => String(s.id) === subjectId) : d.subjects) : [];
  const term = search.trim().toLowerCase();
  const students = (d?.students || []).filter((row) => {
    if (term && !`${row.student.name} ${row.student.roll_number}`.toLowerCase().includes(term)) return false;
    if (!filter) return true;
    const cells = subjects.map((s) => row.teams[String(s.id)]);
    return filter === "without" ? cells.some((c) => !c) : cells.every(Boolean);
  });

  return (
    <>
      <BackLink to={`/faculty/classes/${sectionId}`}>Section students</BackLink>
      <PageHeader
        title={d ? `Teams · Section ${d.section.name}` : "Teams"}
        description={d ? `${sectionLabel(d.section.semester_number, d.section.name)} · which team each student is in, their mentor and evaluator. Open a student for phase-wise marks.` : " "}
      />
      {query.isLoading && <Skeleton className="h-60 w-full" />}
      {d && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.summary.map((s) => {
              const subject = d.subjects.find((x) => x.id === s.semester_subject_id);
              return (
                <div key={s.semester_subject_id} className="rounded-lg border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{subject.subject.code}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {s.in_team} <span className="text-sm font-normal text-muted-foreground">in teams</span>
                  </p>
                  {s.without_team > 0 && <p className="text-xs text-warning">{s.without_team} without a team</p>}
                </div>
              );
            })}
          </div>
          <Toolbar>
            <SearchInput value={search} onChange={setSearch} placeholder="Search students…" />
            <FilterSelect
              label="Subject"
              allLabel="All subjects"
              value={subjectId}
              options={d.subjects.map((s) => ({ value: String(s.id), label: `${s.subject.code} — ${s.subject.name}` }))}
              onChange={(v) => setSubjectId(v === "all" ? null : v)}
            />
            <FilterSelect label="Team status" allLabel="Everyone" value={filter} options={FILTERS} onChange={(v) => setFilter(v === "all" ? null : v)} />
          </Toolbar>
          {!d.subjects.length || !students.length ? (
            <div className="rounded-lg border">
              <EmptyState
                icon={UsersRound}
                title={!d.subjects.length ? "No subjects mapped to this section" : "No students match"}
                description={!d.subjects.length ? "Teams are formed per subject; this section takes none yet." : undefined}
              />
            </div>
          ) : isDesktop ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Student</TableHead>
                    {subjects.map((s) => (
                      <TableHead key={s.id} className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {s.subject.code}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((row) => (
                    <TableRow key={row.student.id} className="align-top">
                      <TableCell className="min-w-44">
                        <p className="font-medium">{row.student.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{row.student.roll_number}</p>
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => setDetails(row.student)}>
                          <Eye className="size-4" /> Details &amp; marks
                        </Button>
                      </TableCell>
                      {subjects.map((s) => (
                        <TableCell key={s.id} className="min-w-56">
                          <TeamCell cell={row.teams[String(s.id)]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <ul className="space-y-3">
              {students.map((row) => (
                <li key={row.student.id} className="space-y-3 rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{row.student.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.student.roll_number}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setDetails(row.student)}>
                      <Eye className="size-4" /> Details
                    </Button>
                  </div>
                  {subjects.map((s) => (
                    <div key={s.id} className="border-t pt-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">{s.subject.code}</p>
                      <TeamCell cell={row.teams[String(s.id)]} />
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <StudentProjectDialog sectionId={sectionId} student={details} onOpenChange={() => setDetails(null)} />
    </>
  );
}
