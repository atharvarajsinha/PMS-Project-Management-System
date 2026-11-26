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
          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-all duration-200 hover:bg-accent/70 hover:text-foreground",
          collapsed && "justify-center px-0",
          isActive &&
            "bg-accent font-semibold text-accent-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.10)] hover:bg-accent hover:text-accent-foreground",
        )
      }
    >
      <item.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
      {!collapsed && <span className="truncate">{item.label}</span>}
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
