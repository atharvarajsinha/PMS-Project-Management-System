import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronRight, ClipboardList, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import ClassMarksDialog from "@/features/faculty-portal/components/ClassMarksDialog";
import { sectionLabel } from "@/features/faculty-portal/components/PortalBits";

// Card for a section where the faculty member is class coordinator: opens the section, or its marks.
export default function ClassSectionCard({ sectionId, semesterNumber, sectionName, studentsCount, inactiveCount, subjectsCount }) {
  const [marksOpen, setMarksOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 md:p-5">
      <Link to={`/faculty/classes/${sectionId}`} className="group flex flex-col gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Class coordinator</p>
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
        {inactiveCount > 0 && (
          <p className="inline-flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
            <AlertCircle className="size-3.5" aria-hidden />
            {inactiveCount} inactive — activate to email their login details
          </p>
        )}
      </Link>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <Link to={`/faculty/classes/${sectionId}`} className="text-xs font-medium text-primary hover:underline">
          Manage students →
        </Link>
        <Button size="sm" variant="outline" onClick={() => setMarksOpen(true)}>
          <ClipboardList className="size-4" /> View marks
        </Button>
      </div>
      <ClassMarksDialog sectionId={sectionId} semesterNumber={semesterNumber} sectionName={sectionName} open={marksOpen} onOpenChange={setMarksOpen} />
    </div>
  );
}
