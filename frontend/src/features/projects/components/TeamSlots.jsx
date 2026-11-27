import { UserRound } from "lucide-react";
import { TeamRole } from "@/config/choices";
import { cn } from "@/lib/utils";

/**
 * Team members as fixed slots: "Team Lead", "Member 1", "Member 2"… in a two-column grid,
 * each card listing Roll / Name / Section / Email (styled after the PBL registration form).
 *
 * Slots fill with joined members (lead first), then pending invites, then empty slots up to `size`.
 * `actions(member)` renders buttons on a joined member's card; `inviteActions(invite)` on an invite's.
 * `onEmptyClick` makes empty slots clickable (e.g. open the invite dialog).
 */
export default function TeamSlots({ members = [], invites = [], size, currentId, actions, inviteActions, onEmptyClick, emptyPill = "Open slot" }) {
  const lead = members.filter((m) => m.role === TeamRole.LEAD);
  const others = members.filter((m) => m.role !== TeamRole.LEAD);
  const slots = [
    ...[...lead, ...others].map((m) => ({ kind: "member", person: m })),
    ...invites.map((i) => ({ kind: "invite", person: i.student, invite: i })),
  ];
  const total = Math.max(size || 0, slots.length);
  while (slots.length < total) slots.push({ kind: "empty" });

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {slots.map((slot, i) => {
        const title = i === 0 ? "Team Lead" : `Member ${i}`;
        const p = slot.person;
        const pill =
          slot.kind === "member" ? (p.id === currentId ? "You" : "Joined") : slot.kind === "invite" ? "Invited" : emptyPill;
        const clickable = slot.kind === "empty" && onEmptyClick;
        return (
          <SlotCard
            key={slot.kind === "empty" ? `empty-${i}` : `${slot.kind}-${p.id}`}
            title={title}
            pill={pill}
            person={p}
            muted={slot.kind !== "member"}
            onClick={clickable ? onEmptyClick : undefined}
            footer={slot.kind === "member" ? actions?.(p) : slot.kind === "invite" ? inviteActions?.(slot.invite) : null}
          />
        );
      })}
    </div>
  );
}

export function SlotCard({ title, pill, person, muted, onClick, footer, compact }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "font-display relative flex w-full gap-4 rounded-[1.25rem] border border-border bg-card text-left",
        compact ? "p-4" : "p-5 sm:p-6",
        onClick && "transition-colors hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary">
        <UserRound className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="pt-0.5 text-base font-semibold leading-tight text-foreground">{title}</p>
          <span className="shrink-0 rounded-full border border-border bg-background px-2.5 py-0.5 font-mono text-xs text-primary dark:bg-muted">
            {pill}
          </span>
        </div>
        <dl className={cn("mt-2 space-y-1 text-sm", muted && person && "opacity-70")}>
          <Field label="Roll" value={person?.roll_number} />
          <Field label="Name" value={person?.name} strong />
          <Field label="Section" value={person?.section?.name} />
          <Field label="Email" value={person?.email} href={person?.email && `mailto:${person.email}`} />
          {person?.phone && <Field label="Phone" value={person.phone} href={`tel:${person.phone.replace(/\s+/g, "")}`} />}
        </dl>
        {footer && <div className="mt-3 flex flex-wrap items-center gap-1">{footer}</div>}
      </div>
    </Comp>
  );
}

function Field({ label, value, strong, href }) {
  const shown = value || "—";
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className={cn("min-w-0 truncate text-foreground", strong && value && "font-medium")}>
        {href ? (
          <a href={href} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {shown}
          </a>
        ) : (
          shown
        )}
      </dd>
    </div>
  );
}
