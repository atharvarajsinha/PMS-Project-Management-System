import { Lock } from "lucide-react";
import { cn, titleCase } from "@/lib/utils";

const styles = {
  ACTIVE: "bg-success/10 text-success border-success/20",
  INACTIVE: "bg-muted text-muted-foreground border-border",
  PENDING: "bg-warning/10 text-warning border-warning/20",
  LOCKED: "bg-secondary text-foreground border-border",
  OPEN: "bg-primary/10 text-primary border-primary/20",
  FAILED: "bg-destructive/10 text-destructive border-destructive/20",
  REJECTED: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function StatusBadge({ status, label, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status] || styles.INACTIVE,
        className,
      )}
    >
      {status === "LOCKED" && <Lock className="size-3" aria-hidden />}
      {label || titleCase(status)}
    </span>
  );
}
