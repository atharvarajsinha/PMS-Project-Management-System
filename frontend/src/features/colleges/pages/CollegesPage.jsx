import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Building2, Pencil, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import DataView, { CardFields } from "@/components/common/DataView";
import EmptyState from "@/components/common/EmptyState";
import ListPagination from "@/components/common/ListPagination";
import PageHeader from "@/components/common/PageHeader";
import RowActions from "@/components/common/RowActions";
import SearchInput from "@/components/common/SearchInput";
import StatusBadge from "@/components/common/StatusBadge";
import Toolbar from "@/components/common/Toolbar";
import { FilterSelect, STATUS_OPTIONS } from "@/components/common/fields";
import CollegeFormDialog from "@/features/colleges/components/CollegeFormDialog";
import { activateCollege, deactivateCollege, deleteCollege, listColleges } from "@/features/colleges/api";
import { useCollege } from "@/context/CollegeContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { formatDate } from "@/lib/utils";

const ORDERING = [
  { value: "name", label: "Name A–Z" },
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
];

export default function CollegesPage() {
  const navigate = useNavigate();
  const { setCollege } = useCollege();
  const { params, setParam } = useListParams({ ordering: "name" });
  const [formState, setFormState] = useState({ open: false, college: null });
  const [confirm, setConfirm] = useState(null); // { type: "delete" | "deactivate", college }

  const query = usePagedList(["platform", "colleges"], listColleges, params, setParam);

  const invalidate = [["platform", "colleges"]];
  const activate = useApiMutation((c) => activateCollege(c.id), { invalidate, success: (c) => `${c.name} activated` });
  const deactivate = useApiMutation((c) => deactivateCollege(c.id), { invalidate, success: (c) => `${c.name} deactivated` });
  const remove = useApiMutation((c) => deleteCollege(c.id, c.code), { invalidate, success: "College deleted" });

  const manage = (college) => {
    setCollege(college);
    navigate("/admin");
  };

  const actions = (c) => (
    <RowActions
      label={`Actions for ${c.name}`}
      items={[
        { label: "Manage college", icon: ArrowLeftRight, onSelect: () => manage(c) },
        { label: "College admin", icon: ShieldCheck, onSelect: () => navigate(`/sa/admins?college=${c.id}`) },
        { label: "Edit", icon: Pencil, onSelect: () => setFormState({ open: true, college: c }) },
        c.status === "ACTIVE"
          ? { label: "Deactivate", icon: Power, onSelect: () => setConfirm({ type: "deactivate", college: c }) }
          : { label: "Activate", icon: Power, onSelect: () => activate.mutate(c) },
        "separator",
        { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirm({ type: "delete", college: c }) },
      ]}
    />
  );

  const columns = [
    {
      key: "name",
      header: "College",
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{c.contact_email || "—"}</p>
        </div>
      ),
    },
    { key: "code", header: "Code", cell: (c) => <span className="font-mono text-[13px] font-medium">{c.code}</span> },
    {
      key: "admin",
      header: "College admin",
      cell: (c) =>
        c.admin ? (
          <div className="min-w-0">
            <p className="truncate">{c.admin.name}</p>
            <p className="truncate text-xs text-muted-foreground">{c.admin.email}</p>
          </div>
        ) : (
          <span className="text-muted-foreground">Not set</span>
        ),
    },
    {
      key: "stats",
      header: "Faculty / Students",
      className: "tabular-nums",
      cell: (c) => `${c.stats?.faculty ?? 0} / ${c.stats?.students ?? 0}`,
    },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    { key: "created", header: "Created", cell: (c) => formatDate(c.created_at) },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-12 text-right", cell: actions },
  ];

  const renderCard = (c) => (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{c.name}</p>
          <p className="font-mono text-[13px] text-muted-foreground">{c.code}</p>
        </div>
        {actions(c)}
      </div>
      <CardFields
        fields={[
          ["Status", <StatusBadge key="s" status={c.status} />],
          ["Admin", c.admin?.name || "Not set"],
          ["Faculty", c.stats?.faculty ?? 0],
          ["Students", c.stats?.students ?? 0],
        ]}
      />
    </>
  );

  const confirmCollege = confirm?.college;

  return (
    <>
      <PageHeader
        title="Colleges"
        description="Create colleges, manage their status and open any college to manage its data."
        actions={
          <Button onClick={() => setFormState({ open: true, college: null })}>
            <Plus className="size-4" /> New college
          </Button>
        }
      />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search name or code…" />
        <FilterSelect label="Status" value={params.status} onChange={(v) => setParam("status", v)} options={STATUS_OPTIONS} allLabel="All statuses" />
        <FilterSelect label="Sort" value={params.ordering === "name" ? "all" : params.ordering} onChange={(v) => setParam("ordering", v)} options={ORDERING.slice(1)} allLabel="Name A–Z" />
      </Toolbar>
      <DataView
        columns={columns}
        rows={query.data?.results}
        renderCard={renderCard}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={
          <EmptyState
            icon={Building2}
            title={params.search || params.status ? "No colleges match" : "No colleges yet"}
            description={params.search || params.status ? "Try a different search or filter." : "Create the first college to get started."}
          />
        }
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <CollegeFormDialog
        open={formState.open}
        college={formState.college}
        onOpenChange={(open) => setFormState((s) => ({ ...s, open }))}
      />
      <ConfirmDialog
        open={confirm?.type === "deactivate"}
        onOpenChange={() => setConfirm(null)}
        title={`Deactivate ${confirmCollege?.name}?`}
        description="All users of this college will be signed out and won't be able to log in until it's activated again."
        confirmLabel="Deactivate"
        onConfirm={() => deactivate.mutateAsync(confirmCollege)}
      />
      <ConfirmDialog
        open={confirm?.type === "delete"}
        onOpenChange={() => setConfirm(null)}
        title={`Delete college ${confirmCollege?.name}?`}
        description="This permanently removes the college and everything in it: users, faculty, students, semesters, subjects and sections. This cannot be undone."
        confirmText={confirmCollege?.code}
        onConfirm={() => remove.mutateAsync(confirmCollege)}
      />
    </>
  );
}
