/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MAX_AGE, dedupe, readCache, writeCache } from "./asyncCache.js";

/**
 * Runs an async fetcher on mount (and whenever `deps` change) and tracks
 * loading/error/data.
 *
 * `deps` is serialised into a single key rather than spread into a dependency
 * array, so callers can pass a plain array without violating the rules of
 * hooks.
 *
 * The set-state-in-effect rule is disabled deliberately: fetching remote data
 * and storing the result IS the intended use of an effect, and the resulting
 * setState is asynchronous (post-await), not the synchronous cascade the rule
 * targets.
 *
 * CACHING (see asyncCache.js)
 * Pass `cacheKey` to opt a call site in. A cached entry paints immediately
 * with `loading: false` and is revalidated in the background, so switching
 * tabs shows real content instead of a skeleton. Without a `cacheKey` the hook
 * behaves exactly as it always did — uncached, loading from scratch — which is
 * the right default for one-off reads and anything write-heavy.
 *
 * The cache key includes `deps`, so a per-hotel call site caches each hotel
 * separately and switching hotels can never show the previous one's data.
 */
export const useAsync = (
  fetcher,
  deps = [],
  { immediate = true, cacheKey, maxAge = DEFAULT_MAX_AGE } = {}
) => {
  const depKey = JSON.stringify(deps);
  // One key per (call site + deps). Null when the caller opted out.
  const key = cacheKey ? `${cacheKey}:${depKey}` : null;

  /*
   * The state the caller reads, seeded from the cache.
   *
   * Kept in ONE object keyed by `key` so a key change re-seeds data, error and
   * loading together — three separate useStates would each need the same guard
   * and could disagree for a render.
   *
   * Seeded during render, not in an effect, for two different reasons:
   *   - On MOUNT, an effect would paint one frame of the skeleton before
   *     swapping in the cached value, which is the flicker this whole
   *     mechanism exists to remove.
   *   - On a KEY CHANGE (switching hotel changes `deps` without remounting),
   *     an effect would leave the PREVIOUS hotel's data on screen for a frame.
   *
   * readCache also DELETES an expired entry, so it must not run on every
   * render — an unrelated re-render would silently evict good cached data.
   * Reading only when the key changes matches what the value means: "what was
   * there to paint when this screen opened?"
   */
  const seedFor = (k) => {
    const value = k ? readCache(k, maxAge) : undefined;
    const hit = value !== undefined;
    return { key: k, data: hit ? value : null, error: null, loading: immediate && !hit, hit };
  };

  const [state, setState] = useState(() => seedFor(key));

  // Deriving state from a changed key, the pattern React documents for this.
  const live = state.key === key ? state : seedFor(key);
  if (live !== state) setState(live);

  const { data, error, loading } = live;
  const hasCached = live.hit;

  const patch = (changes) => setState((s) => ({ ...s, ...changes }));

  const mounted = useRef(true);
  const callId = useRef(0);

  // Holds the latest fetcher so an inline arrow function does not re-trigger
  // the effect on every render.
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

  /**
   * `background` runs the fetch WITHOUT showing a loading state — used for
   * revalidating something already on screen. An explicit run() (a retry
   * button, a refresh after a mutation) always shows loading, because there
   * the user asked for it and silence would look broken.
   */
  const runInternal = useCallback(
    async (background, args) => {
      const id = ++callId.current;
      if (!background) patch({ loading: true, error: null });
      else patch({ error: null });

      try {
        // Only argument-less calls are shared: run(true) in RebateRunner means
        // something different from run(false), and they must not collapse.
        const result = await (key && !args.length
          ? dedupe(key, () => fetcherRef.current())
          : fetcherRef.current(...args));

        // Ignore a slow earlier request that resolves after a newer one.
        if (id === callId.current) {
          // Written even if this component has unmounted: the response is
          // valid data, and the next mount should have it. This is what makes
          // navigating away mid-flight still warm the cache.
          if (key) writeCache(key, result);
          if (mounted.current) patch({ data: result });
        }
        return result;
      } catch (err) {
        // A failed BACKGROUND refresh keeps whatever is already on screen —
        // replacing good cached content with a full-page error because a
        // silent revalidation failed would be worse than showing it stale.
        if (mounted.current && id === callId.current && !(background && hasCached)) {
          patch({ error: err });
        }
        throw err;
      } finally {
        if (mounted.current && id === callId.current && !background) patch({ loading: false });
      }
    },
    [key, hasCached]
  );

  const run = useCallback((...args) => runInternal(false, args), [runInternal]);

  useEffect(() => {
    if (!immediate) return;
    // With a cached value already painted this is a background revalidation;
    // with nothing to show it is the initial load.
    runInternal(hasCached, []).catch(() => {});
    // depKey, not deps: a new key means a different request.
  }, [depKey, immediate, runInternal]);

  /**
   * Writes through to the cache, so an optimistic update survives navigation.
   *
   * Without this, liking a video or marking a notification read would repaint
   * from the stale cached copy on the next visit and the change would appear
   * to undo itself. Accepts an updater function, like useState.
   */
  const setDataCached = useCallback(
    (next) => {
      setState((s) => {
        const value = typeof next === "function" ? next(s.data) : next;
        if (key) writeCache(key, value);
        return { ...s, data: value };
      });
    },
    [key]
  );

  return { data, error, loading, run, setData: setDataCached };
};
