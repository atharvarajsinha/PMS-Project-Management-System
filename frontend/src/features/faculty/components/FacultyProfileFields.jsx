import { useFieldArray } from "react-hook-form";
import { Check, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { TextField } from "@/components/common/fields";
import { useSpecializationOptions } from "@/features/specializations/api";
import { idStr } from "@/lib/ids";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- schema & mapping

const year = z
  .string()
  .trim()
  .regex(/^(19[5-9]\d|20\d\d|2100)?$/, "Enter a year like 2024")
  .optional()
  .or(z.literal(""));
const url = z.string().trim().url("Enter a full link, starting with https://").optional().or(z.literal(""));

export const profileSchema = {
  specialization_ids: z.array(z.string()),
  designation: z.string().trim().max(100, "Too long").optional(),
  qualification: z.string().trim().max(255, "Too long").optional(),
  experience_years: z
    .string()
    .trim()
    .regex(/^(\d{1,2})?$/, "Whole years, e.g. 5")
    .optional(),
  research_areas: z.string().trim().max(5000, "Too long").optional(),
  bio: z.string().trim().max(5000, "Too long").optional(),
  publications: z.array(
    z.object({ title: z.string().trim().min(1, "Title is required").max(500), venue: z.string().trim().max(300).optional(), year, url }),
  ),
  certifications: z.array(
    z.object({ name: z.string().trim().min(1, "Name is required").max(300), issuer: z.string().trim().max(300).optional(), year, url }),
  ),
};

export const PROFILE_FIELD_NAMES = Object.keys(profileSchema);

/** Form values from an API faculty / profile object. */
export function profileDefaults(f) {
  const str = (v) => (v === null || v === undefined ? "" : String(v));
  return {
    specialization_ids: (f?.specializations || []).map((s) => idStr(s.id)),
    designation: f?.designation || "",
    qualification: f?.qualification || "",
    experience_years: str(f?.experience_years),
    research_areas: f?.research_areas || "",
    bio: f?.bio || "",
    publications: (f?.publications || []).map((p) => ({ title: p.title || "", venue: p.venue || "", year: str(p.year), url: p.url || "" })),
    certifications: (f?.certifications || []).map((c) => ({ name: c.name || "", issuer: c.issuer || "", year: str(c.year), url: c.url || "" })),
  };
}

/** API body from form values. */
export function profileBody(v) {
  const yearOf = (y) => (y ? Number(y) : null);
  return {
    specialization_ids: v.specialization_ids.map(Number),
    designation: v.designation || "",
    qualification: v.qualification || "",
    experience_years: v.experience_years === "" || v.experience_years === undefined ? null : Number(v.experience_years),
    research_areas: v.research_areas || "",
    bio: v.bio || "",
    publications: v.publications.map((p) => ({ title: p.title, venue: p.venue || "", year: yearOf(p.year), url: p.url || "" })),
    certifications: v.certifications.map((c) => ({ name: c.name, issuer: c.issuer || "", year: yearOf(c.year), url: c.url || "" })),
  };
}

// ---------------------------------------------------------------- pieces

/** Toggle chips: pick any number of specializations from the college's list. */
export function SpecializationPicker({ value = [], onChange, emptyHint }) {
  const { options, isLoading, isEmpty } = useSpecializationOptions();
  const selected = new Set(value);
  const toggle = (v) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isEmpty) return <p className="text-sm text-muted-foreground">{emptyHint || "Your admin hasn't added any specializations yet."}</p>;
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(o.value)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
            )}
          >
            {on && <Check className="size-3.5" aria-hidden="true" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ListEditor({ control, name, title, addLabel, fields: columns, blank }) {
  const { fields, append, remove } = useFieldArray({ control, name });
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{title}</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">None added.</p>}
      <ul className="space-y-3">
        {fields.map((item, index) => (
          <li key={item.id} className="rounded-lg border bg-muted/20 p-3">
            <div className="grid gap-3 sm:grid-cols-[2fr_1.4fr_5.5rem]">
              {columns.map((c) => (
                <FormField
                  key={c.key}
                  control={control}
                  name={`${name}.${index}.${c.key}`}
                  render={({ field }) => (
                    <FormItem className={cn("space-y-1.5", c.wide && "sm:col-span-3")}>
                      <FormLabel className="text-xs">{c.label}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder={c.placeholder} inputMode={c.inputMode} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => remove(index)}>
                <Trash2 className="size-4" /> Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => append(blank)}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </fieldset>
  );
}

/** Profile section of a faculty form. `form` is a react-hook-form instance holding profileDefaults(). */
export default function FacultyProfileFields({ form, specializationHint }) {
  const { control } = form;
  return (
    <div className="space-y-6">
      <FormField
        control={control}
        name="specialization_ids"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel>Specializations</FormLabel>
            <SpecializationPicker value={field.value} onChange={field.onChange} emptyHint={specializationHint} />
            <FormDescription>Pick all that apply. Students see these when choosing a mentor.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField control={control} name="designation" label="Designation" placeholder="e.g. Assistant Professor" />
        <TextField control={control} name="qualification" label="Qualification" placeholder="e.g. Ph.D. (Computer Science)" />
        <TextField control={control} name="experience_years" label="Experience (years)" inputMode="numeric" placeholder="e.g. 8" />
      </div>
      <TextField control={control} name="research_areas" label="Research areas" multiline rows={3} placeholder="e.g. Deep learning, medical imaging" />
      <TextField control={control} name="bio" label="About" multiline rows={3} placeholder="A short introduction" />
      <ListEditor
        control={control}
        name="publications"
        title="Papers & publications"
        addLabel="Add paper"
        blank={{ title: "", venue: "", year: "", url: "" }}
        fields={[
          { key: "title", label: "Title", wide: true },
          { key: "venue", label: "Journal / conference" },
          { key: "url", label: "Link", placeholder: "https://" },
          { key: "year", label: "Year", inputMode: "numeric" },
        ]}
      />
      <ListEditor
        control={control}
        name="certifications"
        title="Certifications"
        addLabel="Add certification"
        blank={{ name: "", issuer: "", year: "", url: "" }}
        fields={[
          { key: "name", label: "Certification", wide: true },
          { key: "issuer", label: "Issued by" },
          { key: "url", label: "Link", placeholder: "https://" },
          { key: "year", label: "Year", inputMode: "numeric" },
        ]}
      />
    </div>
  );
}
