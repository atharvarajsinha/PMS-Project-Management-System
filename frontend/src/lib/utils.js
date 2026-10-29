import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDate(value) {
  return value ? dateFmt.format(new Date(value)) : "—";
}

export function formatDateTime(value) {
  return value ? dateTimeFmt.format(new Date(value)) : "—";
}

// "ACTIVE" -> "Active"
export function titleCase(value) {
  if (!value) return "";
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}
