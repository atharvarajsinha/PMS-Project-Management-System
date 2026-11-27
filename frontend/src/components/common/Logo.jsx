import { useId } from "react";
import { cn } from "@/lib/utils";

/** Seal-style emblem: an open book under a small spark, inside a ringed brown medallion. */
export function LogoMark({ className }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 40 40" className={cn("size-10 shrink-0", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`lg-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="hsl(var(--gradient-from))" />
          <stop offset="1" stopColor="hsl(var(--gradient-to))" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="19" fill={`url(#lg-${id})`} />
      <circle cx="20" cy="20" r="15.6" fill="none" stroke="hsl(var(--primary-foreground))" strokeOpacity="0.35" strokeWidth="0.8" />
      <path
        d="M20 8.4l.85 2.05 2.05.85-2.05.85L20 14.2l-.85-2.05-2.05-.85 2.05-.85z"
        fill="hsl(var(--primary-foreground))"
      />
      <path d="M10.8 16.4c3.1-1.3 6.2-1.05 9.2.85v10.1c-3-1.9-6.1-2.15-9.2-.85z" fill="hsl(var(--primary-foreground))" />
      <path d="M29.2 16.4c-3.1-1.3-6.2-1.05-9.2.85v10.1c3-1.9 6.1-2.15 9.2-.85z" fill="hsl(var(--primary-foreground))" fillOpacity="0.78" />
    </svg>
  );
}

/**
 * Emblem + serif wordmark; `compact` shows the emblem only.
 * `size`: "full" = "Project Management System", "short" = "PMS",
 * "responsive" = "PMS" below the lg breakpoint and the full name from lg up.
 */
export default function Logo({ compact = false, size = "full", className }) {
  const full = size === "responsive" ? "hidden lg:inline" : size === "full" ? "inline" : "hidden";
  const short = size === "responsive" ? "lg:hidden" : size === "short" ? "" : "hidden";
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark className="drop-shadow-[0_4px_10px_hsl(var(--glow)/0.35)]" />
      {!compact && (
        <>
          <span
            className={cn(
              "whitespace-nowrap font-serif text-[19px] font-semibold leading-none tracking-[-0.01em] text-foreground",
              full,
            )}
          >
            Project Management System
          </span>
          <span className={cn("font-serif text-[19px] font-semibold tracking-[-0.01em] text-foreground", short)}>PMS</span>
        </>
      )}
    </span>
  );
}
