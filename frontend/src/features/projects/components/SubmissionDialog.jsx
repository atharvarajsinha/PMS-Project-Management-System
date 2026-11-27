import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import FormDialog from "@/components/common/FormDialog";
import FormError from "@/components/common/FormError";
import RequiredMark from "@/components/common/RequiredMark";
import { LinkType, optionsOf } from "@/config/choices";
import { projectsKey, saveSubmission } from "@/features/projects/api";
import { useApiMutation } from "@/hooks/useApiMutation";

const blank = () => ({ link_type: LinkType.REPOSITORY, url: "", title: "" });

/**
 * Edit the team's submission for an OPEN phase. Any member can save; the whole link list is replaced.
 * In the project phase (the subject's first phase) the team also sends its project title and
 * description (required to submit) and may set its team name; links are optional there.
 */
export default function SubmissionDialog({ teamId, team, phase, onOpenChange }) {
  const [links, setLinks] = useState([blank()]);
  const [notes, setNotes] = useState("");
  const [project, setProject] = useState({ project_title: "", project_description: "", team_name: "" });
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const isProject = !!phase?.is_project_phase;

  useEffect(() => {
    if (!phase) return;
    setError(null);
    setFieldErrors({});
    const existing = phase.submission?.links?.map(({ link_type, url, title }) => ({ link_type, url, title })) || [];
    setLinks(existing.length ? existing : isProject ? [] : [blank()]);
    setNotes(phase.submission?.notes || "");
    setProject({
      project_title: team?.project_title || "",
      project_description: team?.project_description || "",
      team_name: team?.name || "",
    });
    // Only when the dialog opens: the page refreshes `team` in the background and must not reset typing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const mutation = useApiMutation(
    (submit) =>
      saveSubmission(teamId, phase.id, {
        links: links.filter((l) => l.url.trim()),
        notes,
        submit,
        ...(isProject ? project : {}),
      }),
    {
      invalidate: [projectsKey],
      silentError: true,
      success: (_, submit) => (submit ? "Submitted. You can still edit until the end date." : "Draft saved"),
      onSuccess: () => onOpenChange(false),
    },
  );

  const update = (i, patch) => setLinks((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setField = (key) => (e) => setProject((p) => ({ ...p, [key]: e.target.value }));
  const run = (submit) => {
    const filled = links.filter((l) => l.url.trim());
    const missing = {};
    if (submit && isProject) {
      if (!project.project_title.trim()) missing.project_title = "Enter your project title.";
      if (!project.project_description.trim()) missing.project_description = "Describe your project.";
    }
    setFieldErrors(missing);
    if (Object.keys(missing).length) return setError("Fill in the project title and description before submitting.");
    if (submit && !isProject && !filled.length) return setError("Add at least one link before submitting.");
    if (filled.some((l) => !/^https?:\/\/\S+\.\S+/i.test(l.url.trim()))) return setError("Links must be full addresses starting with https://");
    setError(null);
    mutation.mutateAsync(submit).catch((e) => {
      const d = e.details || {};
      const fields = {};
      for (const key of ["project_title", "project_description", "team_name"]) if (d[key]) fields[key] = [].concat(d[key]).join(" ");
      setFieldErrors(fields);
      if (Object.keys(fields).length) return setError("Check the highlighted fields.");
      setError(Array.isArray(d.links) ? "Check the links: each needs a valid https:// address." : e.message);
    });
  };

  return (
    <FormDialog
      open={!!phase}
      onOpenChange={onOpenChange}
      title={phase ? `Submit · ${phase.name}` : "Submit"}
      description={
        isProject
          ? "Tell your evaluator what your team will build. Links are optional in this phase. Only submitted work is evaluated."
          : "Add links to your work (repository, document, demo…). Saving replaces the team's previous links. Only submitted work is evaluated."
      }
      className="sm:max-w-2xl"
    >
      {phase && (
        <div className="space-y-5">
          <FormError message={error} />

          {isProject && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sub-team-name">Team name</Label>
                <Input
                  id="sub-team-name"
                  value={project.team_name}
                  onChange={setField("team_name")}
                  maxLength={100}
                  placeholder={`Team #${teamId}`}
                  aria-invalid={!!fieldErrors.team_name}
                />
                {fieldErrors.team_name ? (
                  <p className="text-xs text-destructive">{fieldErrors.team_name}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Optional. Names are unique within the subject.</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-title">
                  Project title <RequiredMark />
                </Label>
                <Input id="sub-title" value={project.project_title} onChange={setField("project_title")} maxLength={200} aria-invalid={!!fieldErrors.project_title} />
                {fieldErrors.project_title && <p className="text-xs text-destructive">{fieldErrors.project_title}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-description">
                  Project description <RequiredMark />
                </Label>
                <Textarea
                  id="sub-description"
                  rows={5}
                  value={project.project_description}
                  onChange={setField("project_description")}
                  maxLength={5000}
                  placeholder="What problem it solves, who it is for, and how you plan to build it."
                  aria-invalid={!!fieldErrors.project_description}
                />
                {fieldErrors.project_description && <p className="text-xs text-destructive">{fieldErrors.project_description}</p>}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">
              Links {isProject && <span className="font-normal text-muted-foreground">(optional)</span>}
            </h3>
            {links.length > 0 && (
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
                      onClick={() => setLinks((ls) => (ls.length > 1 || isProject ? ls.filter((_, j) => j !== i) : [blank()]))}
                      aria-label="Remove link"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={() => setLinks((ls) => [...ls, blank()])} disabled={links.length >= 20}>
              <Plus className="size-4" /> Add link
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-notes">Notes for the evaluator</Label>
            <Textarea
              id="sub-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={5000}
              placeholder="Optional: anything the evaluator should know about this submission."
            />
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
