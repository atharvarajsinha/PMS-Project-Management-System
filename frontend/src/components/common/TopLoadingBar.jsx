import { useEffect, useState } from "react";
import { useApiBusy } from "@/lib/apiActivity";

const SHOW_AFTER_MS = 300; // quick calls never flash the bar
const MIN_VISIBLE_MS = 400; // once shown, don't blink off at once

/** Thin bar across the top of the page while an API call is taking a while. */
export default function TopLoadingBar() {
  const busy = useApiBusy();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (busy) {
      const t = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      return () => clearTimeout(t);
    }
    if (!visible) return undefined;
    const t = setTimeout(() => setVisible(false), MIN_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [busy, visible]);

  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!visible}
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="absolute inset-0 bg-primary/15" />
      <div className="animate-loading-bar absolute inset-y-0 w-2/5 rounded-full bg-brand-gradient shadow-[0_0_10px_hsl(var(--glow)/0.7)]" />
    </div>
  );
}
