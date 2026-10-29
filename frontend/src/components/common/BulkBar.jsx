import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown above a list while rows are selected.
export default function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border bg-accent/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-medium tabular-nums">{count} selected</p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" /> Clear
        </Button>
      </div>
    </div>
  );
}
