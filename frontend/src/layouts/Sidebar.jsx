import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import NavGroups from "@/layouts/NavGroups";
import { labelOf } from "@/config/choices";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "pms-sidebar";

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

// Fixed sidebar for lg and up; collapsible to icons only (72px).
export default function Sidebar({ groups }) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggle = () => {
    const next = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "collapsed" : "expanded");
    } catch {
      /* storage unavailable */
    }
    setCollapsed(next);
  };

  return (
    <aside
      className={cn(
        "sticky top-[4.25rem] hidden h-[calc(100dvh-4.25rem)] shrink-0 flex-col border-r border-border/70 bg-card/60 backdrop-blur-xl transition-[width] lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <ScrollArea className="flex-1">
        <nav aria-label="Main" className={cn("px-3 pb-3 pt-5", collapsed && "px-3")}>
          {!collapsed && <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80">Menu</p>}
          <NavGroups groups={groups} collapsed={collapsed} />
        </nav>
      </ScrollArea>
      <div className={cn("space-y-2 border-t border-border/70 p-3", collapsed && "flex flex-col items-center")}>
        {!collapsed && user && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-primary ring-1 ring-primary/10">
              <UserRound className="size-4" strokeWidth={1.9} aria-hidden />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
              <p className="truncate font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{labelOf("Role", user.role)}</p>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(!collapsed && "w-full justify-start px-3 font-medium text-muted-foreground")}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-[18px]" />}
          {!collapsed && "Collapse sidebar"}
        </Button>
      </div>
    </aside>
  );
}
