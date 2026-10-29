import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// Keeps list filters, search and page in the URL query string (design.md §9 Tables).
export function useListParams(defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = { ...defaults };
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  params.page = Number(params.page || 1);

  // Several keys in one navigation (react-router doesn't queue functional updates)
  const setParams = useCallback(
    (updates) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "" || value === "all") next.delete(key);
            else next.set(key, String(value));
          });
          if (!("page" in updates)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setParam = useCallback((key, value) => setParams({ [key]: value }), [setParams]);

  return { params, setParam, setParams };
}
