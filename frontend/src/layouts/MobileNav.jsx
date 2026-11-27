import { useState } from "react";
import { NavLink } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import NavGroups from "@/layouts/NavGroups";
import { BOTTOM_NAV_COUNT } from "@/config/nav";
import { cn } from "@/lib/utils";

const itemClass = "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground";

// Bottom nav below md: up to four items plus "More" (design.md §7).
export default function MobileNav({ groups }) {
  const [moreOpen, setMoreOpen] = useState(false);
  // A labelled group (Super Admin "Managing: …") is what the user is working in, so it gets the bar
  const ordered = [...groups].sort((a, b) => Number(!!b.label) - Number(!!a.label));
  const all = ordered.flatMap((g) => g.items);
  const primary = all.slice(0, BOTTOM_NAV_COUNT);
  const rest = all.slice(BOTTOM_NAV_COUNT);
  // "More" sheet keeps the group labels for the remaining items
  const restGroups = ordered
    .map((g) => ({ ...g, items: g.items.filter((i) => rest.includes(i)) }))
    .filter((g) => g.items.length);

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border/70 bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn(itemClass, isActive && "font-semibold text-primary")}
          >
            {({ isActive }) => (
              <>
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", isActive && "bg-accent")}>
                  <item.icon className="size-5" strokeWidth={1.8} aria-hidden />
                </span>
                <span className="max-w-full truncate px-1">{item.short || item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        {rest.length > 0 && (
          <button type="button" className={itemClass} onClick={() => setMoreOpen(true)}>
            <span className="flex h-7 w-12 items-center justify-center">
              <MoreHorizontal className="size-5" strokeWidth={1.8} aria-hidden />
            </span>
            More
          </button>
        )}
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-lg pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="mb-2 text-left">
            <SheetTitle>More</SheetTitle>
            <SheetDescription className="sr-only">More navigation options</SheetDescription>
          </SheetHeader>
          <NavGroups groups={restGroups} onNavigate={() => setMoreOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
