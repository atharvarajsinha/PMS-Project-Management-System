import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/common/ErrorState";
import StatusBadge from "@/components/common/StatusBadge";
import { getFaculty } from "@/features/faculty/api";
import FacultyProfileView from "@/features/faculty/components/FacultyProfileView";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { formatDateTime } from "@/lib/utils";

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function FacultyDetailSheet({ facultyId, onOpenChange }) {
  const isDesktop = useIsDesktop();
  const query = useQuery({ queryKey: ["faculty", "detail", facultyId], queryFn: () => getFaculty(facultyId), enabled: !!facultyId });
  const f = query.data;

  return (
    <Sheet open={!!facultyId} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? "right" : "bottom"}
        className={isDesktop ? "w-full overflow-y-auto sm:max-w-md" : "max-h-[90dvh] overflow-y-auto rounded-t-lg"}
      >
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>{f?.name || "Faculty"}</SheetTitle>
          <SheetDescription>{f?.email || " "}</SheetDescription>
        </SheetHeader>
        {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
        {query.isLoading && <Skeleton className="h-40 w-full" />}
        {f && (
          <div className="space-y-8">
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <StatusBadge status={f.status} />
              </Field>
              <Field label="Phone">{f.phone || "—"}</Field>
              <Field label="Activated">{formatDateTime(f.activated_at)}</Field>
              <Field label="Last login">{formatDateTime(f.last_login_at)}</Field>
            </dl>
            <section>
              <h3 className="mb-3 text-base font-semibold">Profile</h3>
              <FacultyProfileView faculty={f} />
            </section>
            <section>
              <h3 className="mb-3 text-base font-semibold">Class coordinator of</h3>
              {f.class_teacher_of.length ? (
                <ul className="space-y-2 text-sm">
                  {f.class_teacher_of.map((c) => (
                    <li key={c.section_id}>
                      Semester {c.semester_number} · Section {c.section_name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Not a class coordinator.</p>
              )}
            </section>
            <section>
              <h3 className="mb-3 text-base font-semibold">Teaching</h3>
              {f.teaching?.length ? (
                <ul className="divide-y rounded-lg border">
                  {f.teaching.map((t) => (
                    <li key={t.section_subject_id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-[13px] font-medium">{t.subject_code}</span> {t.subject_name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Sem {t.semester_number} · {t.section_name}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No subjects assigned.</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
