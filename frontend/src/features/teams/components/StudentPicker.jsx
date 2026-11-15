import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import SearchInput from "@/components/common/SearchInput";
import { useDebounce } from "@/hooks/useDebounce";

/**
 * Searchable list of students with a per-row button.
 * `fetcher(params)` returns a paginated list of { id, name, roll_number, section }.
 * `excludeIds`: students already picked elsewhere (hidden from the list).
 */
export default function StudentPicker({
  queryKey,
  fetcher,
  actionLabel = "Add",
  onPick,
  pendingId,
  excludeIds = [],
  emptyText = "No students to add.",
}) {
  const [search, setSearch] = useState("");
  const term = useDebounce(search, 250);
  const query = useQuery({ queryKey: [...queryKey, term], queryFn: () => fetcher({ search: term || undefined, page_size: 30 }) });
  const hidden = new Set(excludeIds.map(String));
  const rows = (query.data?.results || []).filter((s) => !hidden.has(String(s.id)));

  return (
    <div className="space-y-2">
      <SearchInput value={search} onChange={setSearch} placeholder="Search by name or roll number…" />
      <ul className="max-h-64 divide-y overflow-y-auto rounded-md border" aria-busy={query.isFetching}>
        {rows.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-1.5">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{s.roll_number}</span> · Section {s.section.name}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onPick(s)} disabled={pendingId !== undefined && pendingId !== null}>
              {pendingId === s.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {actionLabel}
            </Button>
          </li>
        ))}
        {!rows.length && (
          <li className="px-3 py-4 text-sm text-muted-foreground">{query.isLoading ? "Loading…" : query.isError ? "Couldn't load students." : emptyText}</li>
        )}
      </ul>
      {query.data?.count - hidden.size > rows.length && <p className="text-xs text-muted-foreground">Showing {rows.length} of {query.data.count}. Search to narrow down.</p>}
    </div>
  );
}
