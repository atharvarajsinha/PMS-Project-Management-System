import NavItem from "@/layouts/NavItem";
import { cn } from "@/lib/utils";

export default function NavGroups({ groups, collapsed = false, onNavigate }) {
  return (
    <div className="space-y-4">
      {groups.map((group, i) => (
        <div key={group.label || i} className={cn(i > 0 && !group.label && "border-t pt-4")}>
          {group.label && !collapsed && (
            <p className="mb-2 truncate px-3 text-xs font-medium text-muted-foreground" title={group.label}>
              {group.label}
            </p>
          )}
          {group.label && collapsed && <div className="mb-2 border-t" />}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
