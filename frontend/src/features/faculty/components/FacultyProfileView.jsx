import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SAFE = /^https?:\/\//i;

function Item({ main, sub, url }) {
  return (
    <li className="text-sm">
      {url && SAFE.test(url) ? (
        <a href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          {main} <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      ) : (
        <span className="font-medium">{main}</span>
      )}
      {sub && <span className="text-muted-foreground"> · {sub}</span>}
    </li>
  );
}

/** Read-only faculty profile: specializations, designation, research, papers, certifications. */
export default function FacultyProfileView({ faculty: f, compact }) {
  const facts = [
    ["Designation", f.designation],
    ["Qualification", f.qualification],
    ["Experience", f.experience_years != null ? `${f.experience_years} ${f.experience_years === 1 ? "year" : "years"}` : ""],
  ].filter(([, v]) => v);
  const empty =
    !f.specializations?.length && !facts.length && !f.research_areas && !f.bio && !f.publications?.length && !f.certifications?.length;
  if (empty) return <p className="text-sm text-muted-foreground">No profile details yet.</p>;

  return (
    <div className="space-y-5">
      {!!f.specializations?.length && (
        <div className="flex flex-wrap gap-1.5">
          {f.specializations.map((s) => (
            <Badge key={s.id} variant="secondary">
              {s.name}
            </Badge>
          ))}
        </div>
      )}
      {!!facts.length && (
        <dl className="grid grid-cols-2 gap-4">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {f.research_areas && (
        <div>
          <h4 className="text-xs text-muted-foreground">Research areas</h4>
          <p className="whitespace-pre-wrap text-sm">{f.research_areas}</p>
        </div>
      )}
      {f.bio && !compact && (
        <div>
          <h4 className="text-xs text-muted-foreground">About</h4>
          <p className="whitespace-pre-wrap text-sm">{f.bio}</p>
        </div>
      )}
      {!!f.publications?.length && (
        <div>
          <h4 className="mb-1.5 text-xs text-muted-foreground">Papers & publications ({f.publications.length})</h4>
          <ul className="space-y-1.5">
            {f.publications.map((p, i) => (
              <Item key={i} main={p.title} sub={[p.venue, p.year].filter(Boolean).join(", ")} url={p.url} />
            ))}
          </ul>
        </div>
      )}
      {!!f.certifications?.length && (
        <div>
          <h4 className="mb-1.5 text-xs text-muted-foreground">Certifications ({f.certifications.length})</h4>
          <ul className="space-y-1.5">
            {f.certifications.map((c, i) => (
              <Item key={i} main={c.name} sub={[c.issuer, c.year].filter(Boolean).join(", ")} url={c.url} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
