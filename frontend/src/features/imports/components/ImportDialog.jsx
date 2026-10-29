import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import StatusBadge from "@/components/common/StatusBadge";
import { downloadTemplate, listImports, runImport } from "@/features/imports/api";
import { toastError } from "@/lib/forms";
import { saveCsv, toCsv } from "@/lib/csv";

// Row status → badge style + wording (preview says what *would* happen)
const STATUS = {
  created: { badge: "ACTIVE", preview: "New", done: "Created" },
  updated: { badge: "OPEN", preview: "Update", done: "Updated" },
  skipped: { badge: "INACTIVE", preview: "Skip", done: "Skipped" },
  error: { badge: "FAILED", preview: "Error", done: "Error" },
};

export function useImportKinds() {
  return useQuery({ queryKey: ["imports", "kinds"], queryFn: listImports, staleTime: Infinity });
}

function Summary({ result }) {
  const done = !result.dry_run;
  const items = [
    ["created", done ? "created" : "will be created"],
    ["updated", done ? "updated" : "will be updated"],
    ["skipped", done ? "skipped (no change)" : "unchanged, skipped"],
    ["error", "with errors"],
  ].filter(([key]) => result[key] > 0);
  return (
    <ul className="flex flex-wrap gap-2 text-sm">
      {items.map(([key, label]) => (
        <li key={key} className="flex items-center gap-1.5">
          <StatusBadge status={STATUS[key].badge} label={`${result[key]} ${label}`} />
        </li>
      ))}
    </ul>
  );
}

function RowsTable({ result, errorsOnly }) {
  const rows = errorsOnly ? result.rows.filter((r) => r.status === "error") : result.rows;
  const label = result.dry_run ? "preview" : "done";
  return (
    <div className="max-h-72 overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="w-14 px-3 py-2 font-medium">Row</th>
            <th scope="col" className="w-24 px-3 py-2 font-medium">Status</th>
            <th scope="col" className="px-3 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.row} className="border-t align-top">
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row}</td>
              <td className="px-3 py-2">
                <StatusBadge status={STATUS[r.status].badge} label={STATUS[r.status][label]} />
              </td>
              <td className={r.status === "error" ? "px-3 py-2 text-destructive" : "px-3 py-2"}>{r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * CSV import in three steps: choose file → check (dry run preview) → import valid rows.
 * Invalid rows are never saved; they can be downloaded as a CSV with an "error" column, fixed and re-uploaded.
 */
export default function ImportDialog({ open, onOpenChange, kind, invalidate = [] }) {
  const queryClient = useQueryClient();
  const kinds = useImportKinds();
  const meta = kinds.data?.results.find((k) => k.kind === kind);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null); // dry run preview, then the real result
  const [busy, setBusy] = useState(null); // "check" | "import" | "template"
  const [error, setError] = useState(null);
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setResult(null);
    setError(null);
    setErrorsOnly(false);
  }, [open]);

  const run = async (dryRun) => {
    setBusy(dryRun ? "check" : "import");
    setError(null);
    try {
      const res = await runImport(kind, file, { dryRun });
      setResult(res);
      setErrorsOnly(res.error > 0 && res.error < res.total);
      if (!dryRun) {
        await Promise.all([...invalidate, ["imports"]].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
        const saved = res.created + res.updated;
        toast[res.error ? "warning" : "success"](`${meta?.label}: ${saved} row${saved === 1 ? "" : "s"} imported${res.error ? `, ${res.error} with errors` : ""}`, { duration: 4000 });
      }
    } catch (e) {
      setError(e.details?.file?.[0] || e.message);
    } finally {
      setBusy(null);
    }
  };

  const template = async () => {
    setBusy("template");
    try {
      await downloadTemplate(kind);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const downloadErrors = () => {
    const columns = meta.columns.map((c) => c.name);
    const rows = result.rows.filter((r) => r.status === "error").map((r) => [...columns.map((c) => r.data[c]), r.message]);
    saveCsv(toCsv([...columns, "error"], rows), `pms-${kind}-errors.csv`);
  };

  const pickFile = (f) => {
    setFile(f || null);
    setResult(null);
    setError(null);
  };

  const done = result && !result.dry_run;
  const importable = result ? result.created + result.updated : 0;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Import ${meta?.label.toLowerCase() || "data"} from CSV`}
      description={meta?.description}
      className="sm:max-w-2xl"
    >
      <div className="space-y-6">
        {!result && (
          <>
            <section aria-labelledby="import-columns" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="import-columns" className="text-sm font-semibold">
                  Columns
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={template} disabled={busy === "template"}>
                  {busy === "template" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Download template
                </Button>
              </div>
              {kinds.isLoading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
              ) : kinds.isError ? (
                <FormError message={`Couldn't load the column list: ${kinds.error.message}`} />
              ) : (
                <ul className="divide-y rounded-lg border text-sm">
                  {meta?.columns.map((c) => (
                    <li key={c.name} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:gap-3">
                      <code className="w-44 shrink-0 font-mono text-[13px] font-medium">
                        {c.name}
                        {c.required && <span className="text-destructive"> *</span>}
                      </code>
                      <span className="text-muted-foreground">{c.help}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                <span className="text-destructive">*</span> required. Other columns are ignored. Only valid rows are imported; you can download the rest with the reason, fix them and upload again.
              </p>
            </section>

            <div className="space-y-2">
              <Label htmlFor={`import-file-${kind}`}>CSV file</Label>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileUp className="size-6" aria-hidden />
                {file ? <span className="font-medium text-foreground">{file.name}</span> : <span>Click to choose a .csv file, or drop it here</span>}
              </button>
              <input
                ref={inputRef}
                id={`import-file-${kind}`}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </>
        )}

        <FormError message={error} />

        {result && (
          <section aria-label={done ? "Import result" : "Preview"} className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
              {result.error ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />}
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-medium">
                  {done ? "Import finished" : "Checked"} · {result.total} row{result.total === 1 ? "" : "s"} in {file?.name}
                  {!done && <span className="font-normal text-muted-foreground"> — nothing has been saved yet</span>}
                </p>
                <Summary result={result} />
                {result.ignored_columns.length > 0 && (
                  <p className="text-xs text-muted-foreground">Ignored columns: {result.ignored_columns.join(", ")}</p>
                )}
              </div>
            </div>
            {result.error > 0 && result.error < result.total && (
              <div className="flex items-center gap-2">
                <Switch id={`errors-only-${kind}`} checked={errorsOnly} onCheckedChange={setErrorsOnly} />
                <Label htmlFor={`errors-only-${kind}`}>Show errors only</Label>
              </div>
            )}
            <RowsTable result={result} errorsOnly={errorsOnly} />
          </section>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {result?.error > 0 && (
            <Button type="button" variant="outline" onClick={downloadErrors} className="sm:mr-auto">
              <Download className="size-4" /> Error rows (CSV)
            </Button>
          )}
          {done ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : result ? (
            <>
              <Button type="button" variant="outline" onClick={() => pickFile(null)} disabled={!!busy}>
                Choose another file
              </Button>
              <Button type="button" onClick={() => run(false)} disabled={!!busy || importable === 0}>
                {busy === "import" && <Loader2 className="size-4 animate-spin" />}
                {importable ? `Import ${importable} valid row${importable === 1 ? "" : "s"}` : "Nothing to import"}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => run(true)} disabled={!file || !!busy}>
                {busy === "check" && <Loader2 className="size-4 animate-spin" />} Check file
              </Button>
            </>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
