import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import NavGroups from "@/layouts/NavGroups";
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
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col border-r bg-background/40 transition-[width] lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <ScrollArea className="flex-1">
        <nav aria-label="Main" className={cn("p-3", collapsed && "px-3")}>
          <NavGroups groups={groups} collapsed={collapsed} />
        </nav>
      </ScrollArea>
      <div className={cn("border-t p-3", collapsed && "flex justify-center")}>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(!collapsed && "w-full justify-start text-muted-foreground")}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
          {!collapsed && "Collapse"}
        </Button>
      </div>
    </aside>
  );
}
