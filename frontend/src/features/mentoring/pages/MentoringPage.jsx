import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, History, Inbox, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import EmptyState from "@/components/common/EmptyState";
import ErrorState from "@/components/common/ErrorState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import StatusBadge from "@/components/common/StatusBadge";
import { MentorStatus } from "@/config/choices";
import { acceptMentoring, getMentoring, listMentoring, listMentoringHistory, rejectMentoring } from "@/features/mentoring/api";
import { dateRange, EvaluatorLine, LinkList, MemberList, offeringLabel, PhaseStatus, SubmissionState } from "@/features/teams/components/TeamBits";
import { useApiMutation } from "@/hooks/useApiMutation";
import { formatDateTime } from "@/lib/utils";

const invalidate = [["my", "mentoring"]];

function TeamPhases({ id }) {
  const query = useQuery({ queryKey: ["my", "mentoring", "detail", id], queryFn: () => getMentoring(id) });
  if (query.isLoading) return <Skeleton className="h-20 w-full" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  const phases = query.data.phases || [];
  if (!phases.length) return <p className="text-sm text-muted-foreground">No phases yet.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {phases.map((p) => (
        <li key={p.id} className="space-y-1.5 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-medium">
              {p.name} <PhaseStatus status={p.status} />
            </span>
            <span className="text-xs text-muted-foreground">{dateRange(p)}</span>
          </div>
          <SubmissionState submission={p.submission} />
          {p.submission && <LinkList links={p.submission.links} />}
        </li>
      ))}
    </ul>
  );
}

function TeamCard({ row, onDecide }) {
  const t = row.team;
  const pending = row.status === MentorStatus.PENDING;
  const [showPhases, setShowPhases] = useState(false);
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{t.display_name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {offeringLabel(t.semester_subject)} · {pending ? `requested ${formatDateTime(row.created_at)}` : "you mentor this team"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <MemberList members={t.members} />
        <p className="text-sm">
          <span className="text-muted-foreground">Evaluator: </span>
          <EvaluatorLine evaluators={t.evaluators} />
        </p>
        {pending ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => onDecide(row, true)}>
              <Check className="size-4" /> Accept
            </Button>
            <Button variant="outline" onClick={() => onDecide(row, false)}>
              <X className="size-4" /> Reject
            </Button>
          </div>
        ) : showPhases ? (
          <TeamPhases id={row.id} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowPhases(true)}>
            Show phases &amp; submissions
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Requests I answered (or that ended): who, when, and whether it was automatic. */
export function MentoringHistory() {
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["my", "mentoring", "history", page],
    queryFn: () => listMentoringHistory({ page, page_size: 10 }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.results || [];
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (query.isLoading) return <Skeleton className="h-24 w-full" />;
  if (!rows.length) {
    return (
      <div className="rounded-lg border">
        <EmptyState icon={History} title="No history yet" description="Teams you accept or reject are listed here." />
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y rounded-lg border">
        {rows.map((h) => (
          <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {h.team.display_name}{" "}
                <span className="font-normal text-muted-foreground">
                  · Sem {h.team.semester_number} · {h.team.subject_code}
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">{h.team.members.join(", ")}</p>
              {h.note && <p className="mt-1 text-xs">{h.note}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <StatusBadge status={h.status} group="MentorStatus" />
                {h.is_automatic && <span>automatic</span>}
                {h.by_admin && <span>by Admin</span>}
              </span>
              <span>{formatDateTime(h.decided_at || h.created_at)}</span>
            </div>
          </li>
        ))}
      </ul>
      <ListPagination data={query.data} onPageChange={setPage} />
    </>
  );
}

export default function MentoringPage() {
  const query = useQuery({ queryKey: ["my", "mentoring", "list"], queryFn: () => listMentoring({ page_size: 100 }) });
  const [confirm, setConfirm] = useState(null); // { row, accept }
  const accept = useApiMutation((r) => acceptMentoring(r.id), {
    invalidate,
    success: (_, r) => `You now mentor ${r.team.display_name}. If that filled your slots, other waiting requests were declined.`,
  });
  const reject = useApiMutation((r) => rejectMentoring(r.id), { invalidate, success: "Request rejected. The team can choose another mentor." });
  // Accepting your last free slot declines the other waiting teams automatically

  const rows = query.data?.results || [];
  const pending = rows.filter((r) => r.status === MentorStatus.PENDING);
  const mine = rows.filter((r) => r.status === MentorStatus.ACCEPTED);

  return (
    <>
      <PageHeader title="Mentoring" description="Accept or reject teams that chose you, and follow the teams you mentor. You don't see their marks." />
      {query.error && <ErrorState error={query.error} onRetry={query.refetch} />}
      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {query.data && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-lg font-semibold">Requests ({pending.length})</h2>
            {pending.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {pending.map((r) => (
                  <TeamCard key={r.id} row={r} onDecide={(row, ok) => (ok ? accept.mutate(row) : setConfirm({ row }))} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border">
                <EmptyState icon={Inbox} title="No pending requests" description="Teams that choose you as mentor appear here." />
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">My teams ({mine.length})</h2>
            {mine.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {mine.map((r) => (
                  <TeamCard key={r.id} row={r} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border">
                <EmptyState icon={UserCheck} title="No teams yet" description="Teams you accept show up here with their submissions." />
              </div>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">History</h2>
            <MentoringHistory />
          </section>
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={() => setConfirm(null)}
        title={`Reject ${confirm?.row.team.display_name}?`}
        description="The team is told and can choose another mentor. Your slot is freed."
        confirmLabel="Reject"
        onConfirm={() => reject.mutateAsync(confirm.row)}
      />
    </>
  );
}
