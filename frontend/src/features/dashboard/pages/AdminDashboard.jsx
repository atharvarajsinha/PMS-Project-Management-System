import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarRange, GraduationCap, LayoutGrid, Network, UserCheck, Users } from "lucide-react";
import ErrorState from "@/components/common/ErrorState";
import PageHeader from "@/components/common/PageHeader";
import StatTile from "@/components/common/StatTile";
import StatusBadge from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminDashboard } from "@/features/dashboard/api";
import { getCurrentCollege, getSettings } from "@/features/settings/api";

function TodoItem({ to, icon: Icon, count, label }) {
  if (!count) return null;
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent/60">
        <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span className="flex-1">{label}</span>
        <span className="rounded-full border border-warning/20 bg-warning/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-warning">
          {count}
        </span>
      </Link>
    </li>
  );
}

export default function AdminDashboard() {
  const college = useQuery({ queryKey: ["college"], queryFn: getCurrentCollege });
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  // One request for every count; refetched on mount so it reflects changes made on other pages
  const dashboard = useQuery({ queryKey: ["dashboard", "admin"], queryFn: getAdminDashboard, refetchOnMount: "always" });

  if (college.error) return <ErrorState error={college.error} onRetry={college.refetch} />;
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />;

  const c = college.data;
  const d = dashboard.data;
  const loading = dashboard.isLoading;
  const pending = d?.pending || {};
  const allClear = !loading && Object.values(pending).every((n) => !n);

  return (
    <>
      <PageHeader
        title={c?.name || "Dashboard"}
        description={c ? <span className="font-mono text-[13px]">{c.code}</span> : undefined}
        actions={c && <StatusBadge status={c.status} />}
      />
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Faculty" value={d?.counts.faculty} icon={GraduationCap} loading={loading} />
          <StatTile label="Students" value={d?.counts.students} icon={Users} loading={loading} />
          <StatTile label="Semesters" value={d?.counts.semesters} icon={CalendarRange} loading={loading} />
          <StatTile label="Subjects" value={d?.counts.subjects} icon={BookOpen} loading={loading} />
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-lg border bg-card p-4 md:p-6">
            <h2 className="text-lg font-semibold">Needs attention</h2>
            {loading ? (
              <div className="mt-4 space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : allClear ? (
              <p className="mt-4 text-sm text-muted-foreground">All set. Every account is active and every section is staffed.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                <TodoItem to="/admin/faculty?status=INACTIVE" icon={GraduationCap} count={pending.inactive_faculty} label="Inactive faculty accounts" />
                <TodoItem to="/admin/students?status=INACTIVE" icon={Users} count={pending.inactive_students} label="Inactive student accounts" />
                <TodoItem to="/admin/sections?has_class_teacher=false" icon={UserCheck} count={pending.sections_without_class_teacher} label="Sections without a class teacher" />
                <TodoItem to="/admin/mapping?tab=list&unassigned=true" icon={Network} count={pending.section_subjects_without_faculty} label="Section subjects without faculty" />
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Team settings</h2>
              <Link to="/admin/settings" className="text-sm text-primary underline-offset-4 hover:underline">
                Edit
              </Link>
            </div>
            {settings.data && (
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Team size</dt>
                  <dd className="tabular-nums">
                    {settings.data.min_team_size}–{settings.data.max_team_size} members
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Mentor capacity</dt>
                  <dd className="tabular-nums">{settings.data.default_mentor_capacity} teams</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Team formation</dt>
                  <dd>
                    <StatusBadge status={settings.data.team_formation_enabled ? "OPEN" : "INACTIVE"} label={settings.data.team_formation_enabled ? "Open" : "Closed"} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Teams</dt>
                  <dd>
                    <StatusBadge status={settings.data.teams_locked ? "LOCKED" : "ACTIVE"} label={settings.data.teams_locked ? "Locked" : "Unlocked"} />
                  </dd>
                </div>
              </dl>
            )}
          </section>
        </div>

        {d?.semesters.length > 0 && (
          <section className="rounded-lg border bg-card p-4 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Semesters</h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {d.counts.sections} sections · {d.counts.section_subjects} section subjects
              </span>
            </div>
            <ul className="mt-2 divide-y">
              {d.semesters.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/admin/students?semester_id=${s.id}`}
                    className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md px-3 py-3 text-sm hover:bg-accent/60"
                  >
                    <span className="min-w-28 font-medium">Semester {s.semester_number}</span>
                    <span className="text-muted-foreground tabular-nums">{s.sections} sections</span>
                    <span className="text-muted-foreground tabular-nums">{s.subjects} subjects</span>
                    <span className="ml-auto tabular-nums">{s.students} students</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-4 text-xl font-semibold">Set up</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { to: "/admin/semesters", icon: CalendarRange, label: "1. Semesters" },
              { to: "/admin/sections", icon: LayoutGrid, label: "2. Sections & class teachers" },
              { to: "/admin/subjects", icon: BookOpen, label: "3. Subjects" },
              { to: "/admin/mapping", icon: Network, label: "4. Subject mapping" },
            ].map((step) => (
              <Link key={step.to} to={step.to} className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm font-medium hover:bg-accent/50">
                <step.icon className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                {step.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
