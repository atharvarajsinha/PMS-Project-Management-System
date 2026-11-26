import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import ErrorState from "@/components/common/ErrorState";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * One data source, two renderings: a Table at md+ and stacked cards below md (design.md §7, §9).
 * columns: [{ key, header, cell: (row) => node, className? }]
 */
export default function DataView({ columns, rows, renderCard, loading, error, onRetry, empty, rowKey = (r) => r.id }) {
  const isDesktop = useIsDesktop();

  if (error) return <ErrorState error={error} onRetry={onRetry} />;

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={isDesktop ? "h-12 w-full" : "h-28 w-full"} />
        ))}
      </div>
    );
  }

  if (!rows?.length) return <div className="rounded-2xl border border-border/70 bg-card shadow-soft">{empty}</div>;

  if (!isDesktop) {
    return (
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-2xl border border-border/70 bg-card p-4 shadow-soft">
            {renderCard(row)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-soft">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {columns.map((c) => (
              <TableHead
                key={c.key}
                scope="col"
                className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", c.className)}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)} className="h-12 hover:bg-accent/50">
              {columns.map((c) => (
                <TableCell key={c.key} className={cn("text-sm", c.className)}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Label–value pairs for the mobile card view (kept as <dl> for a11y)
export function CardFields({ fields }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
