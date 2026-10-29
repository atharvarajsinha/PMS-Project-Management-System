import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import ImportDialog from "@/features/imports/components/ImportDialog";
import { importInvalidate } from "@/features/imports/api";

// "Import CSV" page action; `invalidate` = query keys to refresh after a successful import.
export default function ImportButton({ kind, invalidate = importInvalidate(kind), label = "Import CSV", variant = "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Upload className="size-4" /> {label}
      </Button>
      <ImportDialog open={open} onOpenChange={setOpen} kind={kind} invalidate={invalidate} />
    </>
  );
}
