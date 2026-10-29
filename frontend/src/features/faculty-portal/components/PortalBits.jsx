import { Link } from "react-router-dom";
import { ArrowLeft, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";

export function BackLink({ to = "/faculty", children = "Dashboard" }) {
  return (
    <Link
      to={to}
      className="mb-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:min-h-0"
    >
      <ArrowLeft className="size-4" aria-hidden /> {children}
    </Link>
  );
}

// 404 on a /my/... detail means "not yours" (or deleted): explain instead of showing a raw error.
export function PortalLoadError({ error, onRetry, what }) {
  if (error?.status === 404) {
    return (
      <div className="rounded-lg border">
        <EmptyState
          icon={SearchX}
          title={`${what} not found`}
          description={`It may have been reassigned by your admin. You can only open ${what.toLowerCase()}s assigned to you.`}
          action={
            <Button asChild variant="outline">
              <Link to="/faculty">Back to dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }
  return <ErrorState error={error} onRetry={onRetry} />;
}

// "Sem 7 · Section A" style meta line
export const sectionLabel = (semesterNumber, sectionName) => `Semester ${semesterNumber} · Section ${sectionName}`;
