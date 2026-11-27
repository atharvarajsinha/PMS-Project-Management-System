import { forwardRef } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon tile + mono eyebrow + title, e.g. "FORM YOUR TEAM / Enter University Roll Numbers". */
export function SectionHeading({ icon: Icon, eyebrow, title, action, className }) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        {Icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm sm:size-12">
            <Icon className="size-5" strokeWidth={1.75} aria-hidden />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>}
          <h3 className="text-lg font-bold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">{title}</h3>
        </div>
      </div>
      {action}
    </div>
  );
}

/** Amber "Important" notice with a warning icon. */
export function ImportantNote({ title = "Important", children, className }) {
  return (
    <div className={cn("flex gap-4 rounded-2xl border border-[hsl(var(--amber)/0.3)] bg-[hsl(var(--amber)/0.04)] px-4 py-4 sm:px-5", className)}>
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber" strokeWidth={1.75} aria-hidden />
      <div className="space-y-1 pl-1 sm:pl-3">
        <p className="text-sm font-semibold text-amber">{title}</p>
        <div className="text-[15px] text-foreground">{children}</div>
      </div>
    </div>
  );
}

/** Full-width soft button with bold brown text ("Form & Register Team"). */
export const FormButton = forwardRef(function FormButton({ className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-14 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-card text-lg font-semibold text-primary shadow-[0_2px_10px_-2px_hsl(var(--glow)/0.18)] transition-all",
        "hover:border-primary/30 hover:bg-accent/50 active:scale-[0.995]",
        "disabled:pointer-events-none disabled:text-muted-foreground/50 [&_svg]:size-5",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

/** One step of the summary strip ("Academic Year · 2nd Year"). */
export function StepItem({ icon: Icon, label, value, done, align = "left" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3",
        align === "right"
          ? "items-end text-right sm:flex-row-reverse"
          : align === "center"
            ? "items-center text-center sm:justify-center sm:text-left"
            : "items-start",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border shadow-sm",
          done ? "border-primary/20 bg-accent text-primary" : "border-border bg-card text-muted-foreground/60",
        )}
      >
        {Icon && <Icon className="size-4" strokeWidth={1.75} aria-hidden />}
      </span>
      <div className="min-w-0 max-w-full">
        <p className={cn("truncate text-sm font-semibold", done ? "text-foreground" : "text-muted-foreground/70")}>{label}</p>
        <p className={cn("truncate font-mono text-xs", done ? "text-muted-foreground" : "text-muted-foreground/60")}>{value}</p>
      </div>
    </div>
  );
}
