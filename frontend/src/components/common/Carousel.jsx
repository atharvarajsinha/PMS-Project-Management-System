import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shows one item at a time with previous/next buttons and a row of labelled tabs.
 * Controlled: `index` + `onIndexChange`. `tabLabel(item, i)` renders each tab's content,
 * `renderItem(item, i)` the active slide. Swipe left/right on touch screens; arrow keys on the tabs.
 */
export default function Carousel({ items, index, onIndexChange, renderItem, tabLabel, itemKey, label, className, size = "default" }) {
  const touch = useRef(null);
  const count = items.length;
  if (!count) return null;
  const current = Math.min(Math.max(index, 0), count - 1);
  const go = (i) => onIndexChange((i + count) % count);
  const small = size === "sm";

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(current + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(current - 1);
    }
  };

  return (
    <div className={cn("min-w-0 space-y-3", className)} aria-roledescription="carousel" aria-label={label}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("shrink-0", small && "size-8")}
          onClick={() => go(current - 1)}
          disabled={count < 2}
          aria-label="Previous"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div role="tablist" aria-label={label} className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" onKeyDown={onKeyDown}>
          {items.map((item, i) => (
            <button
              key={itemKey ? itemKey(item) : i}
              type="button"
              role="tab"
              aria-selected={i === current}
              tabIndex={i === current ? 0 : -1}
              onClick={() => go(i)}
              className={cn(
                "shrink-0 rounded-md border px-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                small ? "py-1" : "py-1.5",
                i === current ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {tabLabel ? tabLabel(item, i) : i + 1}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
          {current + 1} / {count}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={cn("shrink-0", small && "size-8")}
          onClick={() => go(current + 1)}
          disabled={count < 2}
          aria-label="Next"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div
        role="tabpanel"
        aria-roledescription="slide"
        aria-label={`${current + 1} of ${count}`}
        key={itemKey ? itemKey(items[current]) : current}
        className="animate-in fade-in-0 duration-200"
        onTouchStart={(e) => {
          e.stopPropagation(); // a carousel inside another one swipes on its own
          touch.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          touch.current = null;
          if (Math.abs(dx) > 60) go(current + (dx < 0 ? 1 : -1));
        }}
      >
        {renderItem(items[current], current)}
      </div>
    </div>
  );
}
