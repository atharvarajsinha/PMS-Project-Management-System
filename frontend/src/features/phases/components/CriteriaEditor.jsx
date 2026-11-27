import { useFieldArray } from "react-hook-form";
import { ArrowDown, ArrowUp, ListChecks, Plus, Star, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CriterionKind, labelOf, optionsOf } from "@/config/choices";

const KIND_OPTIONS = optionsOf("CriterionKind");

export const criteriaSchema = z
  .array(
    z.object({
      criterion_id: z.number().optional(),
      name: z.string().trim().min(1, "Enter a name").max(200, "Too long"),
      description: z.string().trim().max(500, "Too long").optional(),
      kind: z.string(),
    }),
  )
  .max(30, "At most 30 criteria")
  .refine((items) => new Set(items.map((c) => c.name.trim().toLowerCase())).size === items.length, {
    message: "Two criteria have the same name.",
  });

/** Form values from the API's phase.criteria */
export const criteriaDefaults = (criteria) =>
  (criteria || []).map((c) => ({ criterion_id: c.id, name: c.name, description: c.description || "", kind: c.kind }));

/** API body from form values (keeps ids so existing results survive) */
export const criteriaBody = (items) =>
  items.map((c) => ({ ...(c.criterion_id ? { id: c.criterion_id } : {}), name: c.name, description: c.description || "", kind: c.kind }));

export const KindIcon = ({ kind, className = "size-3.5" }) =>
  kind === CriterionKind.RATING ? <Star className={className} aria-hidden="true" /> : <ListChecks className={className} aria-hidden="true" />;

/**
 * Dynamic rubric for a phase: any number of checkpoints, each recorded per team as
 * tick / cross or a 1–5 rating. Shown to students; it doesn't change marks.
 */
export default function CriteriaEditor({ form }) {
  const { control } = form;
  const { fields, append, remove, move } = useFieldArray({ control, name: "criteria" });
  const rootError = form.formState.errors.criteria?.root?.message || form.formState.errors.criteria?.message;

  return (
    <fieldset className="space-y-3">
      <div>
        <legend className="text-sm font-medium">Evaluation criteria</legend>
        <p className="text-[0.8rem] text-muted-foreground">
          Optional rubric, e.g. Problem statement, Approach, Demo. The evaluator ticks / crosses or rates each one (1–5) for every team.
          Students see it. Changing a criterion&apos;s type clears what was recorded for it.
        </p>
      </div>
      {fields.length > 0 && (
        <ol className="space-y-3">
          {fields.map((item, index) => (
            <li key={item.id} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-center text-sm font-medium tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_11rem]">
                  <FormField
                    control={control}
                    name={`criteria.${index}.name`}
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="sr-only">Criterion {index + 1} name</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="e.g. Problem statement" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`criteria.${index}.kind`}
                    render={({ field }) => (
                      <FormItem className="space-y-1.5">
                        <FormLabel className="sr-only">Criterion {index + 1} type</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {KIND_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                <span className="inline-flex items-center gap-2">
                                  <KindIcon kind={o.value} /> {o.label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`criteria.${index}.description`}
                    render={({ field }) => (
                      <FormItem className="space-y-1.5 sm:col-span-2">
                        <FormLabel className="sr-only">Criterion {index + 1} hint</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="Optional hint for the evaluator" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex shrink-0 flex-col">
                  <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Move down"
                    disabled={index === fields.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" aria-label={`Remove criterion ${index + 1}`} onClick={() => remove(index)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {rootError && <p className="text-[0.8rem] font-medium text-destructive">{rootError}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= 30}
        onClick={() => append({ name: "", description: "", kind: CriterionKind.CHECK })}
      >
        <Plus className="size-4" /> Add criterion
      </Button>
    </fieldset>
  );
}

export const kindLabel = (kind) => labelOf("CriterionKind", kind);
