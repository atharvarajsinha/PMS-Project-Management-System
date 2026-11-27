import { NavLink } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function NavItem({ item, collapsed = false, onNavigate }) {
  const link = (
    <NavLink
      to={item.to}
      end={item.end}
      onMouseEnter={() => item.load?.()}
      onFocus={() => item.load?.()}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-11 items-center gap-3 rounded-xl border border-transparent px-2 text-sm text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground",
          collapsed && "justify-center px-0",
          isActive && "border-border bg-card font-semibold text-foreground shadow-[0_6px_18px_-12px_hsl(var(--glow)/0.6)] hover:bg-card",
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && <span className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" aria-hidden />}
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              isActive ? "bg-accent text-primary" : "text-muted-foreground group-hover:text-primary",
            )}
          >
            <item.icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
