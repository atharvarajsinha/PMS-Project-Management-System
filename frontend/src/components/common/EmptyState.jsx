export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary" aria-hidden>
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
      )}
      <h4 className="text-base font-semibold">{title}</h4>
      {description && <p className="mt-1 max-w-prose text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
