import { toast } from "sonner";

// Maps a normalized API error onto react-hook-form fields (design.md §9 Forms).
// Returns the message for a top-of-form alert when the error isn't tied to a known field.
export function applyApiErrors(form, error, fields = []) {
  const details = error?.details || {};
  let unmatched = false;
  Object.entries(details).forEach(([field, messages]) => {
    const message = Array.isArray(messages) ? messages.join(" ") : String(messages);
    if (fields.includes(field)) form.setError(field, { type: "server", message });
    else unmatched = true;
  });
  if (details.non_field_errors) return [].concat(details.non_field_errors).join(" ");
  if (!Object.keys(details).length || unmatched) return error?.message || "Something went wrong.";
  return null;
}

export const toastError = (error) => toast.error(error?.message || "Something went wrong.", { duration: 5000 });
