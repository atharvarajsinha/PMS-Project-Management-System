/**
 * The one place the UI gets status / role / type lists from.
 *
 * Values and labels come from choices.generated.js, which is generated from
 * backend/apps/common/choices.py (`python manage.py export_choices`). To add or rename a
 * value, change the backend file and regenerate — never hard-code a list in a page.
 *
 * Only the badge colour (tone) lives here, because it is purely visual.
 */
import { CHOICES } from "./choices.generated";

export * from "./choices.generated";
export { CHOICES };

const labels = Object.fromEntries(
  Object.entries(CHOICES).map(([group, items]) => [group, Object.fromEntries(items.map((i) => [i.value, i.label]))]),
);

/** labelOf("PhaseStatus", "OPEN") → "Open" (falls back to the raw value) */
export const labelOf = (group, value) => labels[group]?.[value] ?? value ?? "";

/** [{ value, label }] for selects and filters; `except` drops some values */
export const optionsOf = (group, { except = [] } = {}) => (CHOICES[group] || []).filter((o) => !except.includes(o.value));

// Badge colours by value (shared across groups: OPEN is "primary" wherever it appears)
const TONES = {
  success: ["ACTIVE", "ACCEPTED", "SUBMITTED", "SENT", "COMPLETED"],
  warning: ["PENDING", "UPCOMING", "DRAFT"],
  primary: ["OPEN", "LEAD"],
  danger: ["FAILED", "REJECTED"],
  strong: ["LOCKED", "CLOSED", "ADMIN_OVERRIDE"],
};
const toneByValue = Object.fromEntries(Object.entries(TONES).flatMap(([tone, values]) => values.map((v) => [v, tone])));

export const toneOf = (value) => toneByValue[value] || "muted";
