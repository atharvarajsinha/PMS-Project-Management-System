import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import ErrorState from "@/components/common/ErrorState";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import PageHeader from "@/components/common/PageHeader";
import { Form, TextField } from "@/components/common/fields";
import { getSettings, updateSettings } from "@/features/settings/api";
import { applyApiErrors } from "@/lib/forms";
import { formatDateTime } from "@/lib/utils";

const FIELDS = [
  "min_team_size",
  "max_team_size",
  "default_mentor_capacity",
  "team_formation_enabled",
];

const int = (min, max, msg) => z.coerce.number({ invalid_type_error: "Enter a number" }).int("Whole numbers only").min(min, msg).max(max, msg);

const schema = z
  .object({
    min_team_size: int(2, 20, "Between 2 and 20"),
    max_team_size: int(2, 20, "Between 2 and 20"),
    default_mentor_capacity: int(1, 100, "Between 1 and 100"),
    team_formation_enabled: z.boolean(),
  })
  .refine((v) => v.max_team_size >= v.min_team_size, { path: ["max_team_size"], message: "Must be at least the minimum size" });

function SwitchField({ control, name, label, description }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="flex items-start justify-between gap-4 space-y-0 py-4">
          <div className="space-y-1">
            <FormLabel className="text-sm font-medium">{label}</FormLabel>
            <FormDescription>{description}</FormDescription>
          </div>
          <FormControl>
            <Switch checked={field.value} onCheckedChange={field.onChange} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const [formError, setFormError] = useState(null);
  const [pendingValues, setPendingValues] = useState(null); // confirm before closing formation (locks teams)
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched" });

  useEffect(() => {
    if (query.data) form.reset(Object.fromEntries(FIELDS.map((f) => [f, query.data[f]])));
  }, [query.data, form]);

  const save = async (values) => {
    setFormError(null);
    try {
      const updated = await updateSettings(values);
      queryClient.setQueryData(["settings"], updated);
      toast.success("Settings saved", { duration: 3000 });
    } catch (error) {
      setFormError(applyApiErrors(form, error, FIELDS));
      throw error;
    }
  };

  const onSubmit = (values) => {
    if (!values.team_formation_enabled && query.data.team_formation_enabled) return setPendingValues(values);
    return save(values).catch(() => {});
  };

  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const s = query.data;

  return (
    <>
      <PageHeader title="Settings" description="College-wide rules for teams and evaluation. Team settings take effect when team formation opens." />
      {query.isLoading ? (
        <Skeleton className="h-96 w-full max-w-3xl" />
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-8" noValidate>
            <FormError message={formError} />
            <section className="rounded-lg border bg-card p-4 md:p-6">
              <h2 className="text-lg font-semibold">Team size</h2>
              <p className="mt-1 text-xs text-muted-foreground">Applies to every project subject in the college.</p>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <TextField control={form.control} name="min_team_size" label="Minimum members" required type="number" inputMode="numeric" min={2} max={20} />
                <TextField control={form.control} name="max_team_size" label="Maximum members" required type="number" inputMode="numeric" min={2} max={20} />
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 md:p-6">
              <h2 className="text-lg font-semibold">Mentoring</h2>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <TextField
                  control={form.control}
                  name="default_mentor_capacity"
                  label="Default mentor capacity"
                  required
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  description="Teams a mentor can take unless set otherwise."
                />
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 md:p-6">
              <h2 className="text-lg font-semibold">Teams & evaluation</h2>
              <div className="mt-2 divide-y">
                <SwitchField
                  control={form.control}
                  name="team_formation_enabled"
                  label="Team formation open"
                  description={
                    <>
                      On: students create, join and leave teams. Off: every team is locked; only you can change teams.
                      {s?.teams_locked_at && (
                        <span className="mt-1 flex items-center gap-1">
                          <Lock className="size-3" aria-hidden /> Teams locked {formatDateTime(s.teams_locked_at)}
                        </span>
                      )}
                    </>
                  }
                />
              </div>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {s?.updated_by ? `Last updated by ${s.updated_by.name} · ${formatDateTime(s.updated_at)}` : `Last updated ${formatDateTime(s?.updated_at)}`}
              </p>
              <FormActions submitLabel="Save settings" pending={form.formState.isSubmitting} disabled={!form.formState.isDirty} />
            </div>
          </form>
        </Form>
      )}
      <ConfirmDialog
        open={!!pendingValues}
        onOpenChange={() => setPendingValues(null)}
        title="Close team formation?"
        description="Every team is locked: students can't create, join or leave teams, and changing a Team Lead no longer moves evaluators. Turn it on again to reopen."
        confirmLabel="Close and lock"
        onConfirm={() => save(pendingValues)}
      />
    </>
  );
}
