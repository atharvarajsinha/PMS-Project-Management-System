import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function FormActions({ onCancel, submitLabel = "Save", pending, disabled }) {
  const online = useOnlineStatus();
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      {onCancel && (
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      )}
      <Button type="submit" disabled={pending || disabled || !online}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}
