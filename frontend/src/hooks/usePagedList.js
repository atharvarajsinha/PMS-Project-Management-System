import { useEffect } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

/**
 * Paginated list query bound to URL params. If the current page no longer exists
 * (e.g. the last row of the last page was deleted → 404 "Invalid page."), fall back to page 1.
 */
export function usePagedList(key, fn, params, setParam) {
  const query = useQuery({
    queryKey: [...key, params],
    queryFn: () => fn(params),
    placeholderData: keepPreviousData,
  });

  const outOfRange = query.error?.status === 404 && params.page > 1;
  useEffect(() => {
    if (outOfRange) setParam("page", null);
  }, [outOfRange, setParam]);

  return { ...query, error: outOfRange ? null : query.error };
}
