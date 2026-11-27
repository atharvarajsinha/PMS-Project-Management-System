import { useAuth } from "@/context/AuthContext";
import { labelOf } from "@/config/choices";

/** Page title block: mono "… Portal" eyebrow, bold title, brown description (PBL form style). */
export default function PageHeader({ title, description, actions, eyebrow }) {
  const { user } = useAuth() || {};
  const kicker = eyebrow ?? (user?.role ? `${labelOf("Role", user.role)} Portal` : null);
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && <p className="mb-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{kicker}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-[2rem] md:leading-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">{actions}</div>}
    </div>
  );
}
