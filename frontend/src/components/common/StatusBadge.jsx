import { Lock } from "lucide-react";
import { labelOf, toneOf } from "@/config/choices";
import { cn, titleCase } from "@/lib/utils";

const styles = {
  success: "bg-success/10 text-success border-success/20",
  muted: "bg-muted text-muted-foreground border-border",
  warning: "bg-warning/10 text-warning border-warning/20",
  strong: "bg-secondary text-foreground border-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * `group` names a list in config/choices (e.g. "PhaseStatus") so the label comes from the
 * central choices; `label` overrides it. Colour follows the value (config/choices TONES).
 */
export default function StatusBadge({ status, group, label, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[toneOf(status)],
        className,
      )}
    >
      {status === "LOCKED" && <Lock className="size-3" aria-hidden />}
      {label || (group ? labelOf(group, status) : titleCase(status))}
    </span>
  );
}
