import { Crown, ExternalLink } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { labelOf, MentorStatus, SubmissionStatus, TeamRole } from "@/config/choices";
import { cn, formatDate } from "@/lib/utils";

// "Sem 7 · DAA — Algorithms"
export const offeringLabel = (o) => (o ? `Sem ${o.semester.semester_number} · ${o.subject.code} — ${o.subject.name}` : "");
export const offeringShort = (o) => (o ? `Sem ${o.semester.semester_number} · ${o.subject.code}` : "");

export const dateRange = (p) => `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`;

export function PhaseStatus({ status }) {
  return <StatusBadge status={status} group="PhaseStatus" />;
}

/** Members with the lead first-marked; `actions(member)` renders per-row buttons. */
export function MemberList({ members, actions, className }) {
  return (
    <ul className={cn("divide-y rounded-md border", className)}>
      {members.map((m) => (
        <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              {m.role === TeamRole.LEAD && <Crown className="size-3.5 shrink-0 text-primary" aria-label={labelOf("TeamRole", m.role)} />}
              {m.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{m.roll_number}</span> · Section {m.section.name}
              {m.role === TeamRole.LEAD && ` · ${labelOf("TeamRole", m.role)}`}
            </p>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions(m)}</div>}
        </li>
      ))}
    </ul>
  );
}

export function MentorLine({ mentors }) {
  if (!mentors?.length) return <span className="text-muted-foreground">No mentor</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {mentors.map((m) => (
        <span key={m.id} className="inline-flex items-center gap-1.5">
          {m.faculty.name}
          {m.status !== MentorStatus.ACCEPTED && <StatusBadge status={m.status} group="MentorStatus" />}
        </span>
      ))}
    </span>
  );
}

/** "Xavier" if every phase has the same evaluator, else "Xavier, Yamini"; flags pending ones. */
export function EvaluatorLine({ evaluators }) {
  if (!evaluators?.length) return <span className="text-muted-foreground">No phases yet</span>;
  const names = [...new Set(evaluators.map((e) => e.evaluator?.name || null))];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {names.filter(Boolean).join(", ")}
      {names.includes(null) && <StatusBadge status="PENDING" label="Evaluator pending" />}
    </span>
  );
}

/**
 * Submission: start – end · Pending/Submitted
 * Evaluation: day after end – evaluation end (or "until locked") · Pending/Completed
 * Badges show only when `showProgress` (i.e. the student has a team).
 */
export function PhaseWindows({ phase, showProgress = true }) {
  const evalEnd = phase.evaluation_end_date ? formatDate(phase.evaluation_end_date) : "until locked";
  return (
    <dl className="grid gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
      <dt className="font-medium text-muted-foreground">Submission</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {dateRange(phase)}
        {showProgress && <StatusBadge status={phase.submission_progress} group="SubmissionProgress" />}
      </dd>
      <dt className="font-medium text-muted-foreground">Evaluation</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {formatDate(phase.evaluation_start_date)} – {evalEnd}
        {showProgress && <StatusBadge status={phase.evaluation_progress} group="EvaluationProgress" />}
      </dd>
    </dl>
  );
}

export function SubmissionState({ submission }) {
  if (!submission) return <StatusBadge status="INACTIVE" label="Not submitted" />;
  return <StatusBadge status={submission.status} group="SubmissionStatus" />;
}

export function LinkList({ links, className }) {
  if (!links?.length) return <p className="text-sm text-muted-foreground">No links.</p>;
  return (
    <ul className={cn("space-y-1", className)}>
      {links.map((l) => (
        <li key={l.id ?? l.url} className="text-sm">
          <a
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 text-primary underline-offset-4 hover:underline"
          >
            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
            <span className="shrink-0 font-medium">{labelOf("LinkType", l.link_type)}</span>
            <span className="truncate text-muted-foreground">{l.title || l.url}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export const isSubmitted = (s) => s?.status === SubmissionStatus.SUBMITTED;

/** Marks the subject's first phase, where teams submit their project title and description. */
export function ProjectPhaseBadge({ className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary",
        className,
      )}
    >
      Project phase
    </span>
  );
}

/** The team's project title and description (from the project phase), or a hint when not sent yet. */
export function ProjectSummary({ team, className }) {
  if (!team?.project_title && !team?.project_description)
    return <p className={cn("text-sm text-muted-foreground", className)}>The team hasn't sent its project title yet.</p>;
  return (
    <div className={cn("space-y-1", className)}>
      <p className="font-medium">{team.project_title || "Untitled project"}</p>
      {team.project_description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{team.project_description}</p>}
    </div>
  );
}
