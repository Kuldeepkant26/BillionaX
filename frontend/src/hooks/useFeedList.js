/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { readCache, writeCache } from "./asyncCache.js";

/**
 * An accumulating, cursor-paginated list.
 *
 * WHY NOT useAsync: it replaces `data` wholesale on every run, so page 2 would
 * erase page 1. WHY NOT usePaginatedList: it holds a page NUMBER, and this feed
 * is walked by a createdAt cursor precisely so that a post published mid-scroll
 * cannot shift the boundary and repeat a row (see listFeed on the server).
 *
 * What it keeps from useAsync is the part that matters to the reader: the
 * accumulated list is written through to the same asyncCache, so navigating to
 * a post and back repaints the whole scroll instead of resetting to page 1.
 *
 * `fetcher` takes ({ cursor, limit }) and resolves { items, nextCursor, hasMore }.
 */
export const useFeedList = (fetcher, { cacheKey, limit = 12, immediate = true } = {}) => {
  const key = cacheKey || null;

  // Seeded during render rather than in an effect, for the reason useAsync
  // documents: an effect paints one frame of the skeleton over content we
  // already have, which is the flicker the cache exists to remove.
  const seed = () => {
    const cached = key ? readCache(key) : undefined;
    return cached === undefined
      ? { items: [], hasMore: true, loaded: false }
      : { ...cached, loaded: true };
  };

  const [state, setState] = useState(seed);
  const [loading, setLoading] = useState(immediate && !state.loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // The cursor lives in a ref, not state: it is bookkeeping for the NEXT
  // request, and a re-render on every page would be a render nobody watches.
  const cursorRef = useRef(state.nextCursor || null);
  const mounted = useRef(true);
  // Guards against two loadMore calls overlapping — an IntersectionObserver
  // fires readily, and two in flight would append the same page twice.
  const inFlight = useRef(false);

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const commit = useCallback(
    (next) => {
      setState(next);
      cursorRef.current = next.nextCursor || null;
      // Written even when unmounted: the rows are valid, and the next mount
      // should paint them.
      if (key) writeCache(key, next);
    },
    [key]
  );

  /** Loads the first page, replacing whatever is on screen. */
  const refresh = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const res = await fetcherRef.current({ limit });
        if (!mounted.current) return;
        commit({
          items: res.items || [],
          nextCursor: res.nextCursor || null,
          hasMore: Boolean(res.hasMore),
          loaded: true,
        });
      } catch (err) {
        // A failed QUIET refresh keeps what is on screen: replacing a read feed
        // with a full-page error because a background revalidation failed is
        // worse than leaving it a few seconds stale.
        if (mounted.current && !(quiet && state.loaded)) setError(err);
      } finally {
        if (mounted.current && !quiet) setLoading(false);
      }
    },
    [commit, limit, state.loaded]
  );

  /** Appends the next page. A no-op when the list is exhausted or busy. */
  const loadMore = useCallback(async () => {
    if (inFlight.current || !state.hasMore || !cursorRef.current) return;
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const res = await fetcherRef.current({ cursor: cursorRef.current, limit });
      if (!mounted.current) return;
      setState((prev) => {
        // De-duplicated by id even though the cursor makes a repeat unlikely:
        // a row deleted between two fetches still shifts nothing, but a retry
        // or a double-fire would otherwise render two React children with the
        // same key.
        const have = new Set(prev.items.map((p) => p.id));
        const merged = [...prev.items, ...(res.items || []).filter((p) => !have.has(p.id))];
        const next = {
          items: merged,
          nextCursor: res.nextCursor || null,
          hasMore: Boolean(res.hasMore),
          loaded: true,
        };
        cursorRef.current = next.nextCursor;
        if (key) writeCache(key, next);
        return next;
      });
    } catch (err) {
      if (mounted.current) setError(err);
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }, [key, limit, state.hasMore]);

  useEffect(() => {
    if (!immediate) return;
    // With rows already painted from cache this is a silent revalidation;
    // with nothing to show it is the initial load.
    refresh({ quiet: state.loaded }).catch(() => {});
    // Deliberately once per mount: `refresh` changes identity with state.loaded,
    // and re-running on that would refetch the feed every time it finished
    // loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate]);

  /**
   * Replaces one row in place — for a like or a save, where the row is already
   * on screen and only a value changed.
   *
   * This is what lets the like handler avoid invalidateCache: invalidating
   * would drop the accumulated list, re-seed from an empty cache and throw the
   * reader back to the top of an infinite scroll mid-read.
   */
  const patchPost = useCallback(
    (postId, changes) => {
      setState((prev) => {
        const items = prev.items.map((p) =>
          p.id === postId ? { ...p, ...(typeof changes === "function" ? changes(p) : changes) } : p
        );
        const next = { ...prev, items };
        if (key) writeCache(key, next);
        return next;
      });
    },
    [key]
  );

  /** Drops one row — the post was deleted, which changes what the list holds. */
  const removePost = useCallback(
    (postId) => {
      setState((prev) => {
        const next = { ...prev, items: prev.items.filter((p) => p.id !== postId) };
        if (key) writeCache(key, next);
        return next;
      });
    },
    [key]
  );

  return {
    items: state.items,
    hasMore: state.hasMore,
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    patchPost,
    removePost,
  };
};
