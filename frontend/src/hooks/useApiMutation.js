import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastError } from "@/lib/forms";

/**
 * Mutation that invalidates the given query keys and toasts on success.
 * `success` may be a string or a function of the result. Pass `silentError` when a form maps the error itself.
 */
export function useApiMutation(mutationFn, { invalidate = [], success, silentError = false, onSuccess } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (data, variables) => {
      await Promise.all(invalidate.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      const message = typeof success === "function" ? success(data, variables) : success;
      if (message) toast.success(message, { duration: 3000 });
      onSuccess?.(data, variables);
    },
    onError: (error) => {
      if (!silentError) toastError(error);
    },
  });
}

// Shared copy for BulkResult responses (API.md §5)
export function bulkMessage({ succeeded = [], failed = [] }, verb) {
  const parts = [`${succeeded.length} ${verb}`];
  if (failed.length) parts.push(`${failed.length} skipped`);
  return parts.join(", ");
}
