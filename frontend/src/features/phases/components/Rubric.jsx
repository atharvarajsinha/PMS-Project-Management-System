import { Check, Star, X } from "lucide-react";
import { CriterionKind } from "@/config/choices";
import { KindIcon, kindLabel } from "@/features/phases/components/CriteriaEditor";
import { cn } from "@/lib/utils";

const RATING_MAX = 5;

/** Tick / cross buttons, or 1–5 stars. Clicking the current value again clears it (null). */
export function RubricValueInput({ criterion, value, onChange, disabled }) {
  const pick = (v) => onChange(value === v ? null : v);
  if (criterion.kind === CriterionKind.RATING) {
    return (
      <div className="flex items-center gap-0.5" role="radiogroup" aria-label={`${criterion.name}: rating out of ${RATING_MAX}`}>
        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => {
          const on = value != null && n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} of ${RATING_MAX}`}
              disabled={disabled}
              onClick={() => pick(n)}
              className="rounded p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60"
            >
              <Star className={cn("size-5", on ? "fill-warning text-warning" : "text-muted-foreground")} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    );
  }
  const btn = (v, Icon, label, onClass) => (
    <button
      type="button"
      role="radio"
      aria-checked={value === v}
      aria-label={label}
      disabled={disabled}
      onClick={() => pick(v)}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60",
        value === v ? onClass : "bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label={criterion.name}>
      {btn(1, Check, "Tick", "border-success bg-success text-success-foreground")}
      {btn(0, X, "Cross", "border-destructive bg-destructive text-destructive-foreground")}
    </div>
  );
}

/** Read-only result: ✓ / ✗ / ★★★☆☆ / "Not recorded". */
export function RubricValue({ kind, value }) {
  if (value === null || value === undefined) return <span className="text-xs text-muted-foreground">Not recorded</span>;
  if (kind === CriterionKind.RATING) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`${value} of ${RATING_MAX}`}>
        {Array.from({ length: RATING_MAX }, (_, i) => (
          <Star key={i} className={cn("size-3.5", i < value ? "fill-warning text-warning" : "text-muted-foreground/50")} aria-hidden="true" />
        ))}
      </span>
    );
  }
  return value ? (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-success">
      <Check className="size-4" aria-hidden="true" /> Met
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-destructive">
      <X className="size-4" aria-hidden="true" /> Not met
    </span>
  );
}

/**
 * A phase's rubric as a list. `criteria` items: {id, name, description, kind, result?}.
 * With `showResults`, each row shows its result (or "Not recorded"); `resultsNote` explains when they appear.
 */
export function RubricList({ criteria, showResults = false, resultsNote, className }) {
  if (!criteria?.length) return null;
  return (
    <div className={cn("space-y-1.5", className)}>
      <ul className="divide-y rounded-md border">
        {criteria.map((c) => (
          <li key={c.id} className="flex min-h-10 items-center justify-between gap-3 px-3 py-1.5">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm">
                <span className="text-muted-foreground" title={kindLabel(c.kind)}>
                  <KindIcon kind={c.kind} />
                </span>
                {c.name}
              </p>
              {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
            </div>
            <div className="shrink-0">
              {showResults ? <RubricValue kind={c.kind} value={c.result} /> : <span className="text-xs text-muted-foreground">{kindLabel(c.kind)}</span>}
            </div>
          </li>
        ))}
      </ul>
      {resultsNote && <p className="text-xs text-muted-foreground">{resultsNote}</p>}
    </div>
  );
}
