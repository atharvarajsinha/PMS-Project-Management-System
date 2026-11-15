import { QueryClient } from "@tanstack/react-query";

// Every page keeps itself current: visible queries refetch on this interval (paused while the
// browser tab is hidden). The header's refresh button refetches immediately.
export const AUTO_REFRESH_MS = 10_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchInterval: AUTO_REFRESH_MS,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      // Auth/permission errors won't fix themselves on retry
      retry: (count, error) => count < 1 && !(error?.status >= 400 && error?.status < 500),
    },
  },
});
