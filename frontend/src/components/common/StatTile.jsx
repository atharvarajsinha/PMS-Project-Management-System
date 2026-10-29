import { Skeleton } from "@/components/ui/skeleton";

export default function StatTile({ label, value, icon: Icon, loading }) {
  return (
    <div className="relative overflow-hidden rounded-lg border bg-card p-4 md:p-6">
      <span className="absolute inset-x-0 top-0 h-0.5 bg-brand-gradient" aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</p>
      )}
    </div>
  );
}
