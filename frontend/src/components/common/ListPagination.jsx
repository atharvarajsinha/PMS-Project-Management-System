import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Server-side pagination footer: "Showing 1–20 of 134" + previous/next.
export default function ListPagination({ data, onPageChange }) {
  if (!data || data.count === 0) return null;
  const { count, page, page_size: size, total_pages: pages } = data;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, count);

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <p className="text-xs text-muted-foreground tabular-nums">
        Showing {from}–{to} of {count}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Previous</span>
        </Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <span className="hidden sm:inline">Next</span> <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
