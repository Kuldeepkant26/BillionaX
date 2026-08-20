/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from "react";

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
 */
export const useAsync = (fetcher, deps = [], { immediate = true } = {}) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);

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

  const depKey = JSON.stringify(deps);

  const run = useCallback(async (...args) => {
    const id = ++callId.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current(...args);
      // Ignore a slow earlier request that resolves after a newer one.
      if (mounted.current && id === callId.current) setData(result);
      return result;
    } catch (err) {
      if (mounted.current && id === callId.current) setError(err);
      throw err;
    } finally {
      if (mounted.current && id === callId.current) setLoading(false);
    }
  }, [depKey]);

  useEffect(() => {
    if (immediate) run().catch(() => {});
  }, [run, immediate]);

  return { data, error, loading, run, setData };
};
