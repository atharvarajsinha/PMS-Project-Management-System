import { useState } from "react";

// Row selection for bulk actions, scoped to the rows currently shown.
export function useSelection() {
  const [ids, setIds] = useState(() => new Set());

  const toggle = (id) =>
    setIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = (rows = []) =>
    setIds((prev) => (rows.length && rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))));

  const allSelected = (rows = []) => rows.length > 0 && rows.every((r) => ids.has(r.id));
  const someSelected = (rows = []) => rows.some((r) => ids.has(r.id)) && !allSelected(rows);

  return { ids: [...ids], count: ids.size, has: (id) => ids.has(id), toggle, toggleAll, allSelected, someSelected, clear: () => setIds(new Set()) };
}
