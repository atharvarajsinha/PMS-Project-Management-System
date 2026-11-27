import { Link } from "react-router-dom";
import { Info, Loader2 } from "lucide-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import RequiredMark from "@/components/common/RequiredMark";
import { optionsOf } from "@/config/choices";
import { idStr } from "@/lib/ids";
import { cn } from "@/lib/utils";
import { MarkdownEditor } from "@/components/common/Markdown";

export { Form };

// Thin wrappers over shadcn <FormField> so feature forms stay short.
export function TextField({ control, name, label, required, description, className, multiline, ...inputProps }) {
  const Comp = multiline ? Textarea : Input;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("space-y-3", className)}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <FormControl>
            <Comp {...field} value={field.value ?? ""} {...inputProps} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Textarea with a formatting toolbar (headings, lists and sub-lists, bold, italic, links, preview); the value is Markdown (shown with <Markdown>). */
export function MarkdownField({ control, name, label, required, description, className, ...editorProps }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("space-y-3", className)}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <FormControl>
            <MarkdownEditor {...field} {...editorProps} />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Shown inside an open dropdown that has nothing to pick. */
export function SelectEmpty({ loading, error, text = "Nothing to choose yet." }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground" role="status">
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Info className="size-4" aria-hidden />}
      {loading ? "Loading…" : error ? "Couldn't load options. Close and try again." : text}
    </div>
  );
}

/**
 * What to do when a dropdown is empty: a short sentence plus an optional link.
 * hint: { text, linkLabel?, to?, onNavigate? }
 */
export function EmptyHint({ hint }) {
  if (!hint) return null;
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-x-1 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-foreground"
    >
      <Info className="size-3.5 shrink-0 text-warning" aria-hidden />
      <span>{hint.text}</span>
      {hint.to && (
        <Link to={hint.to} onClick={hint.onNavigate} className="font-medium text-primary underline-offset-4 hover:underline">
          {hint.linkLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * options: [{ value, label, disabled? }]; `none` adds a clearable option (value null).
 * loading / error / emptyText / emptyHint describe the "no options" case; `showHint` forces the hint
 * (e.g. options exist but are all disabled).
 */
export function SelectField({
  control,
  name,
  label,
  required,
  description,
  options,
  placeholder = "Select…",
  none,
  className,
  disabled,
  loading,
  error,
  emptyText,
  emptyHint,
  showHint,
}) {
  // A disabled field (e.g. waiting on another choice) isn't "empty" yet
  const empty = !disabled && !loading && !error && options.length === 0;
  const errorHint = error && !disabled ? { text: "Couldn't load the options. Reload the page and try again." } : null;
  const hint = errorHint || (emptyHint && (showHint ?? empty) ? emptyHint : null);
  // Never open a Select with nothing in it: Radix can't focus an item, so it won't close on Esc or
  // outside click and traps the form. Placeholder + hint explain why it's disabled.
  const nothingToPick = !options.length && !none;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("space-y-3", className)}>
          <FormLabel>
            {label}
            {required && <RequiredMark />}
          </FormLabel>
          <Select
            value={field.value ? idStr(field.value) : none ? "__none" : ""}
            onValueChange={(v) => field.onChange(v === "__none" ? null : v)}
            disabled={disabled || nothingToPick}
          >
            <FormControl>
              <SelectTrigger onBlur={field.onBlur}>
                <SelectValue
                  placeholder={
                    loading ? "Loading…" : error ? "Couldn't load options" : empty && !none ? emptyText || placeholder : placeholder
                  }
                />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {none && <SelectItem value="__none">{none}</SelectItem>}
              {options.map((o) => (
                <SelectItem key={o.value} value={idStr(o.value)} disabled={o.disabled}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint ? <EmptyHint hint={hint} /> : description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Toolbar filter select. `allLabel` maps to "all" (removed from the URL). */
export function FilterSelect({ value, onChange, options, allLabel, label, className, loading, emptyText }) {
  return (
    <Select value={value ? idStr(value) : "all"} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full sm:w-44", className)} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={idStr(o.value)}>
            {o.label}
          </SelectItem>
        ))}
        {!options.length && (loading || emptyText) && <SelectEmpty loading={loading} text={emptyText} />}
      </SelectContent>
    </Select>
  );
}

// Account status filter options, from the central choices (config/choices.js)
export const STATUS_OPTIONS = optionsOf("AccountStatus");
