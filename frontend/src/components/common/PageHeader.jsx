/** Page title block: bold title and muted description, with optional actions on the right. */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-[2rem] md:leading-tight">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">{actions}</div>}
    </div>
  );
}
