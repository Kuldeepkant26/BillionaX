/**
 * A tiny in-memory cache behind useAsync, so moving between tabs shows the
 * data that is already known instead of a skeleton.
 *
 * WHY THIS EXISTS
 * Every page is code-split and unmounts on navigation, so useAsync restarted
 * from `loading: true` each time and the page rendered its skeleton over data
 * it had fetched seconds earlier. Going Offers -> Home -> Offers meant three
 * full loading states for two screens' worth of data.
 *
 * THE MODEL is stale-while-revalidate:
 *   - A cached entry paints IMMEDIATELY, with no loading state.
 *   - A refetch still runs in the background, so the screen is never stale for
 *     longer than one round trip.
 *   - Only a cache MISS shows a skeleton.
 * Revalidating always (rather than trusting a TTL) is the conservative choice
 * for this app: balances, bills and offers change from other devices, and a
 * guest seeing a stale coin balance is worse than a brief background fetch.
 * `maxAge` therefore governs how long an entry may be PAINTED before it is
 * treated as a miss, not how long it is trusted outright.
 *
 * IN MEMORY, NOT localStorage — deliberately. This holds other people's
 * personal data (member names, phone numbers, bills), and persisting it would
 * leave it on a shared front-desk machine after logout. It lives for one page
 * session and dies with the tab.
 *
 * NOT a general query library. It does what this app needs — keyed entries,
 * background revalidation, explicit invalidation, a wipe on logout — and
 * nothing else. Reach for a real cache library only if requirements outgrow
 * these ~60 lines.
 */

/** key -> { data, at } */
const store = new Map();

/**
 * In-flight requests, so two components mounting on the same key in the same
 * frame share ONE network call. The panel does this on nearly every page: a
 * table and a summary card both read the same settings.
 */
const inflight = new Map();

/**
 * How long a cached entry may be painted before it counts as a miss.
 *
 * Five minutes is long enough to cover normal tab-hopping and short enough
 * that a screen left open over a lunch break loads fresh rather than flashing
 * hours-old numbers.
 */
export const DEFAULT_MAX_AGE = 5 * 60 * 1000;

/**
 * The cached value for a key, or undefined if absent or too old to paint.
 *
 * `undefined` means MISS. A cached `null` or `0` is a hit and is returned as
 * such — several endpoints legitimately resolve to null (no active hotel), and
 * treating those as misses would make them re-fetch on every single render.
 *
 * The age test is `>=`, so `maxAge: 0` means "never paint from cache" rather
 * than "paint for the first millisecond". `Infinity` never expires.
 */
export const readCache = (key, maxAge = DEFAULT_MAX_AGE) => {
  if (!key) return undefined;
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at >= maxAge) {
    // Dropped rather than kept: holding it would only make the next read
    // re-check the same expired timestamp.
    store.delete(key);
    return undefined;
  }
  return entry.data;
};

export const writeCache = (key, data) => {
  if (!key) return;
  store.set(key, { data, at: Date.now() });
};

/** Shares one in-flight promise across concurrent callers of the same key. */
export const dedupe = (key, start) => {
  if (!key) return start();
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = start().finally(() => {
    // Only clear if it is still OURS: a newer call for the same key may have
    // replaced it while this one was settling.
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
};

/**
 * Drops cached entries.
 *
 * With no argument it clears everything — what logout does, so the next user
 * on a shared machine cannot be shown the previous one's data. With a string
 * it drops every key CONTAINING that string, which is how a mutation says
 * "anything about members is now wrong" without naming each key.
 */
export const invalidateCache = (match) => {
  if (match === undefined) {
    store.clear();
    inflight.clear();
    return;
  }
  for (const key of store.keys()) if (key.includes(match)) store.delete(key);
  for (const key of inflight.keys()) if (key.includes(match)) inflight.delete(key);
};

/** Test/debug helper — the number of live entries. */
export const cacheSize = () => store.size;
