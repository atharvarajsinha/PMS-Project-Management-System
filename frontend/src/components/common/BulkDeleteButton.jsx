import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { bulkMessage, useApiMutation } from "@/hooks/useApiMutation";

// Checkbox column for lists with bulk actions; `.cell(row)` also works inside mobile cards.
export function selectColumn(selection, rows, describe) {
  return {
    key: "select",
    header: (
      <Checkbox
        checked={selection.allSelected(rows) ? true : selection.someSelected(rows) ? "indeterminate" : false}
        onCheckedChange={() => selection.toggleAll(rows)}
        aria-label="Select all on this page"
      />
    ),
    className: "w-10",
    cell: (row) => (
      <Checkbox checked={selection.has(row.id)} onCheckedChange={() => selection.toggle(row.id)} aria-label={`Select ${describe(row)}`} />
    ),
  };
}

/**
 * "Delete" in a BulkBar: confirms (type DELETE), then POST {list}/bulk-delete/.
 * Rows that can't be deleted (e.g. still in use) are skipped and listed in the toast.
 */
export default function BulkDeleteButton({ selection, noun, mutationFn, invalidate, description }) {
  const [open, setOpen] = useState(false);
  const mutation = useApiMutation(mutationFn, {
    invalidate,
    onSuccess: (r) => {
      selection.clear();
      const message = bulkMessage(r, "deleted");
      if (!r.failed.length) return toast.success(message, { duration: 3000 });
      const reasons = r.failed.slice(0, 3).map((f) => f.message);
      if (r.failed.length > 3) reasons.push(`and ${r.failed.length - 3} more`);
      toast.warning(message, { description: reasons.join(" · "), duration: 6000 });
    },
  });

  return (
    <>
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${selection.count} ${noun}?`}
        description={`${description} Anything still in use is skipped. This cannot be undone.`}
        confirmText="DELETE"
        onConfirm={() => mutation.mutateAsync(selection.ids)}
      />
    </>
  );
}
