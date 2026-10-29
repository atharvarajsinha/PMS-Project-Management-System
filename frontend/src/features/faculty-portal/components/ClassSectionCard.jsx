import { Link } from "react-router-dom";
import { AlertCircle, ChevronRight, Users } from "lucide-react";
import { sectionLabel } from "@/features/faculty-portal/components/PortalBits";

// Clickable card for a section where the faculty member is class teacher.
export default function ClassSectionCard({ sectionId, semesterNumber, sectionName, studentsCount, inactiveCount, subjectsCount }) {
  return (
    <Link
      to={`/faculty/classes/${sectionId}`}
      className="group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 md:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Class teacher</p>
          <p className="truncate font-semibold">{sectionLabel(semesterNumber, sectionName)}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Users className="size-4 text-muted-foreground" aria-hidden /> {studentsCount} students
        </span>
        {subjectsCount !== undefined && <span className="text-muted-foreground tabular-nums">{subjectsCount} subjects</span>}
      </div>
      {inactiveCount > 0 ? (
        <p className="inline-flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
          <AlertCircle className="size-3.5" aria-hidden />
          {inactiveCount} inactive — activate to email their login details
        </p>
      ) : (
        <p className="text-xs font-medium text-primary">Manage students →</p>
      )}
    </Link>
  );
}
