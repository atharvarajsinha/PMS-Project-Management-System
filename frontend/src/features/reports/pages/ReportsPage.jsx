import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import { FilterSelect } from "@/components/common/fields";
import { downloadReport, listReports } from "@/features/reports/api";
import { useOfferingOptions, useSemesterOptions } from "@/hooks/useLookups";
import { toastError } from "@/lib/forms";

const FORMATS = [
  { value: "csv", label: "CSV", icon: FileText },
  { value: "xlsx", label: "Excel", icon: FileSpreadsheet },
];

function ReportRow({ report, index }) {
  const [semesterId, setSemesterId] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [busy, setBusy] = useState(null); // format being downloaded
  const semesters = useSemesterOptions();
  const offerings = useOfferingOptions(semesterId || undefined);

  const usesSemester = report.filters.includes("semester_id");
  const usesSubject = report.filters.includes("semester_subject_id");
  const needsSubject = report.required.includes("semester_subject_id");
  // The subject picker lists one semester's subjects when a semester is picked; marks/rubric reports
  // have no semester filter of their own, so the semester picker there only narrows the subject list.
  const showSemester = usesSemester || usesSubject;
  const missing = needsSubject && !offeringId;

  const download = async (format) => {
    setBusy(format);
    try {
      await downloadReport(report.kind, format, {
        semester_id: usesSemester ? semesterId : undefined,
        semester_subject_id: usesSubject ? offeringId : undefined,
      });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-col gap-4 rounded-lg border bg-card p-4 lg:flex-row lg:items-center">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold tabular-nums text-primary" aria-hidden>
        {index + 1}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h2 className="font-semibold">{report.label}</h2>
          <p className="text-sm text-muted-foreground">{report.description}</p>
        </div>
        {showSemester && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <FilterSelect
              label={`${report.label}: semester`}
              value={semesterId}
              onChange={(v) => {
                setSemesterId(v === "all" ? "" : v);
                setOfferingId("");
              }}
              options={semesters.options}
              loading={semesters.isLoading}
              allLabel="All semesters"
            />
            {usesSubject && (
              <FilterSelect
                label={`${report.label}: subject`}
                value={offeringId}
                onChange={(v) => setOfferingId(v === "all" ? "" : v)}
                options={offerings.options}
                loading={offerings.isLoading}
                emptyText="No subjects offered yet."
                allLabel={needsSubject ? "Choose a subject" : "All subjects"}
                className="sm:w-72"
              />
            )}
          </div>
        )}
        {missing && <p className="text-xs text-muted-foreground">Choose a subject to download this report.</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        {FORMATS.map((f) => (
          <Button key={f.value} variant="outline" onClick={() => download(f.value)} disabled={!!busy || missing}>
            {busy === f.value ? <Loader2 className="size-4 animate-spin" /> : <f.icon className="size-4" />} {f.label}
          </Button>
        ))}
      </div>
    </li>
  );
}

export default function ReportsPage() {
  const query = useQuery({ queryKey: ["reports"], queryFn: listReports, staleTime: Infinity });
  return (
    <>
      <PageHeader title="Reports" description="Download marks, students, faculty and phase details as CSV or Excel files." />
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
        </div>
      ) : (
        <ol className="space-y-3">
          {query.data.results.map((r, i) => (
            <ReportRow key={r.kind} report={r} index={i} />
          ))}
        </ol>
      )}
    </>
  );
}
