import { useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import { downloadTemplate, importInvalidate } from "@/features/imports/api";
import ImportDialog, { useImportKinds } from "@/features/imports/components/ImportDialog";
import { toastError } from "@/lib/forms";

export default function ImportPage() {
  const kinds = useImportKinds();
  const [dialog, setDialog] = useState({ open: false, kind: null });
  const [downloading, setDownloading] = useState(null);

  const template = async (kind) => {
    setDownloading(kind);
    try {
      await downloadTemplate(kind);
    } catch (e) {
      toastError(e);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Import Data"
        description="Set up a college from CSV files. Import in this order: each step only refers to data from the steps before it."
      />
      {kinds.error ? (
        <ErrorState error={kinds.error} onRetry={kinds.refetch} />
      ) : kinds.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : (
        <ol className="space-y-3">
          {kinds.data.results.map((k, i) => (
            <li key={k.kind} className="flex flex-col gap-4 rounded-lg border bg-card p-4 md:flex-row md:items-center">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{k.label}</h2>
                <p className="text-sm text-muted-foreground">{k.description}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {k.columns.map((c) => c.name + (c.required ? "*" : "")).join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" onClick={() => template(k.kind)} disabled={downloading === k.kind}>
                  {downloading === k.kind ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Template
                </Button>
                <Button variant="outline" onClick={() => setDialog({ open: true, kind: k.kind })}>
                  <Upload className="size-4" /> Import
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <ImportDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        kind={dialog.kind}
        invalidate={importInvalidate(dialog.kind)}
      />
    </>
  );
}
