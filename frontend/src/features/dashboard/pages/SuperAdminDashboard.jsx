import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, GraduationCap, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import StatTile from "@/components/common/StatTile";
import StatusBadge from "@/components/common/StatusBadge";
import { listColleges } from "@/features/colleges/api";
import { useAuth } from "@/context/AuthContext";

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ["platform", "colleges", "dashboard"],
    queryFn: () => listColleges({ page_size: 200, ordering: "-created_at" }),
  });

  const colleges = query.data?.results || [];
  const sum = (k) => colleges.reduce((n, c) => n + (c.stats?.[k] || 0), 0);
  const missingAdmin = colleges.filter((c) => !c.admin);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Platform overview across all colleges." />
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile label="Colleges" value={query.data?.count} icon={Building2} loading={query.isLoading} />
            <StatTile
              label="Active colleges"
              value={colleges.filter((c) => c.status === "ACTIVE").length}
              icon={ShieldCheck}
              loading={query.isLoading}
            />
            <StatTile label="Faculty" value={sum("faculty")} icon={GraduationCap} loading={query.isLoading} />
            <StatTile label="Students" value={sum("students")} icon={Users} loading={query.isLoading} />
          </div>

          {missingAdmin.length > 0 && (
            <section className="rounded-[1.25rem] border border-border/80 bg-card shadow-soft p-4 md:p-6">
              <h2 className="text-lg font-semibold">Colleges without an admin</h2>
              <p className="mt-1 text-xs text-muted-foreground">Each college needs a College Admin to manage its data.</p>
              <ul className="mt-4 divide-y">
                {missingAdmin.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0 truncate text-sm">
                      {c.name} <span className="font-mono text-[13px] text-muted-foreground">{c.code}</span>
                    </span>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/sa/admins?college=${c.id}`}>Add admin</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-[1.25rem] border border-border/80 bg-card shadow-soft p-4 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent colleges</h2>
              <Button asChild variant="link" className="px-0">
                <Link to="/sa/colleges">View all</Link>
              </Button>
            </div>
            <ul className="mt-2 divide-y">
              {colleges.slice(0, 5).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 truncate text-sm">{c.name}</span>
                  <StatusBadge status={c.status} />
                </li>
              ))}
              {!query.isLoading && !colleges.length && <li className="py-3 text-sm text-muted-foreground">No colleges yet.</li>}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
