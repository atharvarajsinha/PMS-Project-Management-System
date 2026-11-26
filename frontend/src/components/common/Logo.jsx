import { cn } from "@/lib/utils";

export default function Logo({ compact = false, className }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-brand-gradient text-xs font-bold tracking-wide text-primary-foreground shadow-sm shadow-[hsl(var(--glow)/0.25)]">
        PMS
      </span>
      {!compact && <span className="text-base tracking-tight">Project Management</span>}
    </span>
  );
}
