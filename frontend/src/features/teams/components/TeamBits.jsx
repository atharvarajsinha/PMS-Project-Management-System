import { ExternalLink, Mail, Phone } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { labelOf, MentorStatus, SubmissionStatus, TeamRole } from "@/config/choices";
import { cn, formatDate } from "@/lib/utils";
import { SlotCard } from "@/features/projects/components/TeamSlots";

// "Sem 7 · DAA — Algorithms"
export const offeringLabel = (o) => (o ? `Sem ${o.semester.semester_number} · ${o.subject.code} — ${o.subject.name}` : "");
export const offeringShort = (o) => (o ? `Sem ${o.semester.semester_number} · ${o.subject.code}` : "");

export const dateRange = (p) => `${formatDate(p.start_date)} – ${formatDate(p.end_date)}`;

export function PhaseStatus({ status }) {
  return <StatusBadge status={status} group="PhaseStatus" />;
}

/** Members with the lead first-marked; `actions(member)` renders per-row buttons. */
export function MemberList({ members, actions, className, wide = false }) {
  // Lead first, then members in their order: "Team Lead", "Member 1", "Member 2"…
  const ordered = [...members.filter((m) => m.role === TeamRole.LEAD), ...members.filter((m) => m.role !== TeamRole.LEAD)];
  return (
    <div className={cn("grid gap-3", wide && "sm:grid-cols-2", className)}>
      {ordered.map((m, i) => (
        <SlotCard
          key={m.id}
          compact
          title={m.role === TeamRole.LEAD ? labelOf("TeamRole", m.role) : `Member ${i}`}
          pill={m.role === TeamRole.LEAD ? "Lead" : "Joined"}
          person={m}
          footer={actions?.(m) || null}
        />
      ))}
    </div>
  );
}

/** Email and phone of a team member as mailto:/tel: links (phone only when set). */
export function MemberContact({ member, className }) {
  if (!member.email && !member.phone) return null;
  return (
    <p className={cn("mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs", className)}>
      {member.email && (
        <a href={`mailto:${member.email}`} className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline">
          <Mail className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{member.email}</span>
        </a>
      )}
      {member.phone && (
        <a href={`tel:${member.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          <Phone className="size-3 shrink-0" aria-hidden="true" />
          {member.phone}
        </a>
      )}
    </p>
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
