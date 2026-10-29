import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mail, Pencil, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
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
import CollegeAdminFormDialog from "@/features/college-admins/components/CollegeAdminFormDialog";
import {
  activateCollegeAdmin,
  deactivateCollegeAdmin,
  deleteCollegeAdmin,
  getCollegeAdmin,
  listColleges,
  resendCollegeAdminCredentials,
} from "@/features/colleges/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useListParams } from "@/hooks/useListParams";
import { usePagedList } from "@/hooks/usePagedList";
import { sameId } from "@/lib/ids";

const ACTIVATED = "Account activated. Login details have been emailed.";

// One College Admin per college: this page lists colleges with their admin slot.
export default function CollegeAdminsPage() {
  const { params, setParam } = useListParams({ ordering: "name" });
  const [form, setForm] = useState({ open: false, college: null, admin: null });
  const [confirm, setConfirm] = useState(null); // { type, college }

  const query = usePagedList(["platform", "colleges"], listColleges, params, setParam);

  // Full CollegeAdmin (phone, last login) is only needed for edit
  const adminQuery = useQuery({
    queryKey: ["platform", "college-admin", form.college?.id],
    queryFn: () => getCollegeAdmin(form.college.id),
    enabled: form.open && !!form.college?.admin,
  });

  const invalidate = [["platform"]];
  const activate = useApiMutation((c) => activateCollegeAdmin(c.id), { invalidate, success: ACTIVATED });
  const deactivate = useApiMutation((c) => deactivateCollegeAdmin(c.id), { invalidate, success: "College admin deactivated" });
  const resend = useApiMutation((c) => resendCollegeAdminCredentials(c.id), {
    invalidate,
    success: "New login details have been emailed.",
  });
  const remove = useApiMutation((c) => deleteCollegeAdmin(c.id), { invalidate, success: "College admin deleted" });

  const rows = query.data?.results;
  const highlighted = params.college;

  const actions = (c) =>
    c.admin ? (
      <RowActions
        label={`Actions for ${c.admin.name}`}
        items={[
          { label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, college: c, admin: c.admin }) },
          c.admin.status === "ACTIVE"
            ? { label: "Deactivate", icon: Power, onSelect: () => setConfirm({ type: "deactivate", college: c }) }
            : { label: "Activate", icon: Power, onSelect: () => activate.mutate(c) },
          { label: "Resend credentials", icon: Mail, hidden: c.admin.status !== "ACTIVE", onSelect: () => resend.mutate(c) },
          "separator",
          { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirm({ type: "delete", college: c }) },
        ]}
      />
    ) : (
      <Button variant="outline" size="sm" onClick={() => setForm({ open: true, college: c, admin: null })}>
        <Plus className="size-4" /> Add admin
      </Button>
    );

  const columns = [
    {
      key: "college",
      header: "College",
      cell: (c) => (
        <div className={sameId(highlighted, c.id) ? "font-medium text-primary" : "font-medium"}>
          {c.name} <span className="ml-1 font-mono text-[13px] text-muted-foreground">{c.code}</span>
        </div>
      ),
    },
    {
      key: "admin",
      header: "Admin",
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
    { key: "status", header: "Status", cell: (c) => (c.admin ? <StatusBadge status={c.admin.status} /> : "—") },
    { key: "actions", header: <span className="sr-only">Actions</span>, className: "w-32 text-right", cell: actions },
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
      {c.admin && (
        <CardFields
          fields={[
            ["Admin", c.admin.name],
            ["Status", <StatusBadge key="s" status={c.admin.status} />],
          ]}
        />
      )}
    </>
  );

  const cc = confirm?.college;
  const editingAdmin = form.admin ? adminQuery.data || form.admin : null;

  return (
    <>
      <PageHeader title="College Admins" description="Each college has one admin who manages its faculty, students and academics." />
      <Toolbar>
        <SearchInput value={params.search} onChange={(v) => setParam("search", v)} placeholder="Search college…" />
      </Toolbar>
      <DataView
        columns={columns}
        rows={rows}
        renderCard={renderCard}
        loading={query.isLoading}
        error={query.error}
        onRetry={query.refetch}
        empty={<EmptyState icon={ShieldCheck} title="No colleges" description="Create a college first, then add its admin." />}
      />
      <ListPagination data={query.data} onPageChange={(p) => setParam("page", p)} />

      <CollegeAdminFormDialog
        open={form.open}
        onOpenChange={(open) => setForm((s) => ({ ...s, open }))}
        college={form.college}
        admin={editingAdmin}
      />
      <ConfirmDialog
        open={confirm?.type === "deactivate"}
        onOpenChange={() => setConfirm(null)}
        title={`Deactivate ${cc?.admin?.name}?`}
        description="They'll be signed out and won't be able to log in until reactivated."
        confirmLabel="Deactivate"
        onConfirm={() => deactivate.mutateAsync(cc)}
      />
      <ConfirmDialog
        open={confirm?.type === "delete"}
        onOpenChange={() => setConfirm(null)}
        title={`Delete college admin ${cc?.admin?.name}?`}
        description="This permanently removes the account. A new admin can be created afterwards. This cannot be undone."
        confirmText={cc?.admin?.email}
        onConfirm={() => remove.mutateAsync(cc)}
      />
    </>
  );
}
