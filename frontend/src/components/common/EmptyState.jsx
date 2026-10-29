export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      {Icon && <Icon className="mb-3 size-10 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
      <h4 className="text-base font-semibold">{title}</h4>
      {description && <p className="mt-1 max-w-prose text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
