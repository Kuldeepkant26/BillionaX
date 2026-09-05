import { useCallback, useMemo, useState } from "react";
import { useAsync } from "./useAsync.js";
import { useDebounced } from "./useDebounced.js";

const isEmpty = (v) => v === "" || v === null || v === undefined;

/**
 * Server-driven list state: page + limit + filters + a debounced search box.
 *
 * Built on useAsync, which already discards out-of-order responses — that
 * matters here because filter changes fire requests in quick succession.
 *
 * `key` names the array in the response. The API is deliberately inconsistent
 * ({items} / {staff} / {admins} / {purchases}) because renaming those fields
 * would break the panel silently if the backend shipped ahead of the frontend.
 * That inconsistency is absorbed here, once.
 */
export const usePaginatedList = (
  fetcher,
  { limit = 25, filters: initialFilters = {}, debounceMs = 350, key = "items" } = {}
) => {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState(initialFilters);

  const debouncedQ = useDebounced(q, debounceMs);

  // Any filter or search change invalidates the current page — staying on
  // page 4 of a result set that now has one page shows an empty table forever.
  const setFilter = useCallback((name, value) => {
    setPage(1);
    setFilters((f) => ({ ...f, [name]: value }));
  }, []);

  const search = useCallback((value) => {
    setPage(1);
    setQ(value);
  }, []);

  const resetFilters = useCallback(() => {
    setPage(1);
    setQ("");
    setFilters(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const params = useMemo(() => {
    const active = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => !isEmpty(v))
    );
    return { page, limit, ...(debouncedQ ? { q: debouncedQ } : {}), ...active };
  }, [page, limit, debouncedQ, filters]);

  const { data, error, loading, run, setData } = useAsync(() => fetcher(params), [params]);

  const items = data?.[key] ?? data?.items ?? [];
  const total = data?.total ?? items.length;

  return {
    items,
    total,
    // The whole response, for callers that need a field beyond the paged list
    // — the transactions view reads `bills` off it to merge non-coin bill
    // activity into the same table.
    data,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    loading,
    error,
    run,
    setData,
    setPage,
    q,
    search,
    filters,
    setFilter,
    resetFilters,
    activeFilterCount: Object.values(filters).filter((v) => !isEmpty(v)).length + (q ? 1 : 0),
  };
};
