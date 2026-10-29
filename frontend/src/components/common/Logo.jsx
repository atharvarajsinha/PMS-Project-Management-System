import { cn } from "@/lib/utils";

export default function Logo({ compact = false, className }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold", className)}>
      <span className="flex size-8 items-center justify-center rounded-md bg-brand-gradient text-xs font-bold text-primary-foreground">
        PMS
      </span>
      {!compact && <span className="text-base tracking-tight">Project Management</span>}
    </span>
  );
}
