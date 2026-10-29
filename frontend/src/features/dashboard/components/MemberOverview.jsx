import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import StatusBadge from "@/components/common/StatusBadge";
import { getSettings } from "@/features/settings/api";

// Read-only college rules shown on faculty/student dashboards.
export default function MemberOverview() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const s = settings.data;
  if (!s) return null;
  return (
    <section className="rounded-lg border bg-card p-4 md:p-6">
      <h2 className="text-lg font-semibold">Project teams</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Team size</dt>
          <dd className="tabular-nums">
            {s.min_team_size}–{s.max_team_size} members
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Team formation</dt>
          <dd>
            {s.teams_locked ? (
              <StatusBadge status="LOCKED" label="Locked" />
            ) : (
              <StatusBadge status={s.team_formation_enabled ? "OPEN" : "INACTIVE"} label={s.team_formation_enabled ? "Open" : "Not open yet"} />
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">
        {s.teams_locked && <Lock className="mr-1 inline size-3" aria-hidden />}
        Teams, phases and submissions will appear here once your college opens them.
      </p>
    </section>
  );
}
