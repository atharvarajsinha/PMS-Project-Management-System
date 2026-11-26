import { Skeleton } from "@/components/ui/skeleton";

export default function StatTile({ label, value, icon: Icon, loading }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-soft transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden>
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-9 w-16" />
      ) : (
        <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value ?? "—"}</p>
      )}
    </div>
  );
}
