import { Skeleton } from "@/components/ui/skeleton";

/** Stat card: outlined icon tile, brown label, bold value (PBL form style). */
export default function StatTile({ label, value, icon: Icon, loading }) {
  return (
    <div className="relative flex flex-col items-start gap-3 overflow-hidden rounded-[1.25rem] border border-border bg-card p-4 shadow-soft sm:flex-row sm:items-center sm:gap-4 sm:p-5 lg:flex-col lg:items-start lg:gap-3 xl:flex-row xl:items-center xl:gap-4 transition-colors hover:border-primary/30">
      {Icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border sm:size-12 border-border bg-card text-primary shadow-sm" aria-hidden>
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <p className="font-display truncate text-sm text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="mt-1.5 h-8 w-16" />
        ) : (
          <p className="mt-0.5 truncate text-2xl font-bold tracking-tight tabular-nums text-foreground">{value ?? "—"}</p>
        )}
      </div>
    </div>
  );
}
