import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import { LinkType, optionsOf } from "@/config/choices";
import { projectsKey, saveSubmission } from "@/features/projects/api";
import { useApiMutation } from "@/hooks/useApiMutation";

const blank = () => ({ link_type: LinkType.REPOSITORY, url: "", title: "" });

/** Edit the team's links for an OPEN phase. Any member can save; the whole list is replaced. */
export default function SubmissionDialog({ teamId, phase, onOpenChange }) {
  const [links, setLinks] = useState([blank()]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!phase) return;
    setError(null);
    const existing = phase.submission?.links?.map(({ link_type, url, title }) => ({ link_type, url, title })) || [];
    setLinks(existing.length ? existing : [blank()]);
    setNotes(phase.submission?.notes || "");
  }, [phase]);

  const mutation = useApiMutation(
    (submit) => saveSubmission(teamId, phase.id, { links: links.filter((l) => l.url.trim()), notes, submit }),
    {
      invalidate: [projectsKey],
      silentError: true,
      success: (_, submit) => (submit ? "Submitted. You can still edit until the end date." : "Draft saved"),
      onSuccess: () => onOpenChange(false),
    },
  );

  const update = (i, patch) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const run = (submit) => {
    const filled = links.filter((l) => l.url.trim());
    if (submit && !filled.length) return setError("Add at least one link before submitting.");
    if (filled.some((l) => !/^https?:\/\/\S+\.\S+/i.test(l.url.trim()))) return setError("Links must be full addresses starting with https://");
    setError(null);
    mutation.mutateAsync(submit).catch((e) => {
      const details = e.details?.links;
      setError(Array.isArray(details) ? "Check the links: each needs a valid https:// address." : e.message);
    });
  };

  return (
    <FormDialog
      open={!!phase}
      onOpenChange={onOpenChange}
      title={phase ? `Submit · ${phase.name}` : "Submit"}
      description="Add links to your work (repository, document, demo…). Saving replaces the team's previous links. Only submitted work is evaluated."
      className="sm:max-w-2xl"
    >
      {phase && (
        <div className="space-y-5">
          <FormError message={error} />
          <ul className="space-y-3">
            {links.map((l, i) => (
              <li key={i} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[10rem_1fr_auto]">
                <Select value={l.link_type} onValueChange={(v) => update(i, { link_type: v })}>
                  <SelectTrigger aria-label="Link type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsOf("LinkType").map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-2">
                  <Input value={l.url} onChange={(e) => update(i, { url: e.target.value })} placeholder="https://…" type="url" inputMode="url" aria-label="Link address" />
                  <Input value={l.title} onChange={(e) => update(i, { title: e.target.value })} placeholder="Short title (optional)" maxLength={200} aria-label="Link title" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setLinks((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [blank()]))}
                  aria-label="Remove link"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" onClick={() => setLinks((ls) => [...ls, blank()])} disabled={links.length >= 20}>
            <Plus className="size-4" /> Add link
          </Button>
          <div className="space-y-2">
            <Label htmlFor="sub-notes">Notes for the evaluator</Label>
            <Textarea id="sub-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => run(false)} disabled={mutation.isPending}>
              Save draft
            </Button>
            <Button onClick={() => run(true)} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />} Submit
            </Button>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
