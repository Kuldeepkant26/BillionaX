/**
 * The request cache behind useAsync.
 *
 * Run with `npm test` in frontend/. Uses node:test with no extra dependencies,
 * the same as the backend suite — the cache is plain ES modules with no React
 * or DOM in it, which is precisely why the caching LOGIC lives there rather
 * than inside the hook.
 *
 * What is pinned here is the behaviour a user would notice if it broke: a
 * return visit not painting instantly, one hotel's data leaking into another's
 * screen, or the cache surviving a logout on a shared machine.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  readCache,
  writeCache,
  dedupe,
  invalidateCache,
  cacheSize,
  DEFAULT_MAX_AGE,
} from "../src/hooks/asyncCache.js";

/**
 * useAsync's first-render decision, reproduced.
 *
 * This is the seeding logic from the top of the hook. Kept in step with it by
 * hand: a React renderer would be a dependency and a build step for the sake
 * of four lines, and it is those four lines that decide whether the user sees
 * a skeleton or their data.
 */
const seedFor = (key, { immediate = true, maxAge = DEFAULT_MAX_AGE } = {}) => {
  const value = key ? readCache(key, maxAge) : undefined;
  const hit = value !== undefined;
  return { key, data: hit ? value : null, loading: immediate && !hit, hit };
};

const firstRender = ({ cacheKey, deps = [], immediate = true, maxAge = DEFAULT_MAX_AGE }) => {
  const key = cacheKey ? `${cacheKey}:${JSON.stringify(deps)}` : null;
  return { ...seedFor(key, { immediate, maxAge }), key };
};

/**
 * A mounted component rendering repeatedly, then having its key changed.
 * Mirrors the hook's `state.key === key ? state : seedFor(key)` derivation.
 */
const mount = (key, opts) => {
  let state = seedFor(key, opts);
  return {
    get state() { return state; },
    rerender() { return state; },              // key unchanged: NO cache read
    setKey(next) { state = state.key === next ? state : seedFor(next, opts); return state; },
  };
};

beforeEach(() => invalidateCache());

describe("cache reads and writes", () => {
  it("round-trips a value", () => {
    writeCache("a:[]", { v: 1 });
    assert.equal(readCache("a:[]").v, 1);
  });

  it("reports a miss as undefined", () => {
    assert.equal(readCache("nothing:[]"), undefined);
  });

  it("treats a null key as opted out rather than crashing", () => {
    writeCache(null, { v: 9 });
    assert.equal(readCache(null), undefined);
  });

  it("counts a cached null or 0 as a HIT", () => {
    // Several endpoints resolve to null (no active hotel). Treating those as
    // misses would refetch them on every render.
    writeCache("n:[]", null);
    writeCache("z:[]", 0);
    assert.equal(readCache("n:[]"), null);
    assert.equal(readCache("z:[]"), 0);
  });
});

describe("expiry", () => {
  it("never paints from cache at maxAge 0", () => {
    writeCache("k:[]", { v: 1 });
    assert.equal(readCache("k:[]", 0), undefined);
  });

  it("drops an expired entry rather than merely hiding it", () => {
    writeCache("k:[]", { v: 1 });
    readCache("k:[]", 0);
    assert.equal(cacheSize(), 0, "the expired entry is still taking up space");
  });

  it("serves an entry inside its window", () => {
    writeCache("k:[]", { v: 1 });
    assert.equal(readCache("k:[]", 60_000).v, 1);
  });

  it("never expires at Infinity", () => {
    writeCache("k:[]", { v: 1 });
    assert.equal(readCache("k:[]", Infinity).v, 1);
  });
});

describe("in-flight de-duplication", () => {
  it("shares one request between concurrent callers", async () => {
    let calls = 0;
    const slow = () => new Promise((r) => { calls++; setTimeout(() => r("done"), 10); });

    const results = await Promise.all([
      dedupe("k:[]", slow), dedupe("k:[]", slow), dedupe("k:[]", slow),
    ]);

    assert.equal(calls, 1, "three callers made more than one request");
    assert.deepEqual(results, ["done", "done", "done"]);
  });

  it("starts a fresh request once the shared one has settled", async () => {
    let calls = 0;
    const f = () => Promise.resolve(++calls);
    await dedupe("k:[]", f);
    await dedupe("k:[]", f);
    assert.equal(calls, 2);
  });

  it("does not wedge a key after a rejection", async () => {
    // A failed request that stayed in the map would make the key permanently
    // unfetchable — every later caller would await a promise that is already
    // rejected, and retry would silently do nothing.
    let calls = 0;
    const bad = () => { calls++; return Promise.reject(new Error("boom")); };
    await dedupe("e:[]", bad).catch(() => {});
    await dedupe("e:[]", bad).catch(() => {});
    assert.equal(calls, 2, "the key was wedged by the first failure");
  });
});

describe("invalidation", () => {
  it("drops matching keys and spares the rest", () => {
    writeCache("hotel.dashboard:[]", 1);
    writeCache("hotel.packs:[]", 2);
    writeCache("guest.memberships:[]", 3);

    invalidateCache("hotel.dashboard");

    assert.equal(readCache("hotel.dashboard:[]"), undefined);
    assert.equal(readCache("hotel.packs:[]"), 2);
    assert.equal(readCache("guest.memberships:[]"), 3);
  });

  it("wipes everything when called bare — this is what logout does", () => {
    writeCache("a:[]", 1);
    writeCache("b:[]", 2);
    invalidateCache();
    assert.equal(cacheSize(), 0);
  });
});

describe("re-rendering must not disturb the cache", () => {
  it("does not evict a cached entry when a mounted screen re-renders", async () => {
    // readCache DELETES expired entries. When the seed read sat in the render
    // body, any re-render past maxAge silently threw away good data — so the
    // NEXT visit to the tab showed a skeleton for no reason.
    const key = "k:[]";
    writeCache(key, { v: 1 });

    const screen = mount(key, { maxAge: 20 });
    assert.equal(screen.state.hit, true);

    await new Promise((r) => setTimeout(r, 30));
    screen.rerender();
    screen.rerender();

    assert.equal(cacheSize(), 1, "a re-render evicted the entry");
    assert.equal(readCache(key, Infinity).v, 1);
  });

  it("keeps `hit` stable across re-renders once mounted", async () => {
    // `hit` feeds the fetch callback's dependencies. Flipping it under a
    // mounted component re-triggered the effect and fired a second request.
    const key = "k:[]";
    writeCache(key, { v: 1 });

    const screen = mount(key, { maxAge: 20 });
    const before = screen.state.hit;

    await new Promise((r) => setTimeout(r, 30));

    assert.equal(screen.rerender().hit, before, "hit flipped mid-life, causing a refetch");
  });
});

describe("changing key without a remount", () => {
  it("re-seeds from the new key rather than showing the old data", () => {
    // Switching hotel changes deps on a MOUNTED screen. The old hotel's
    // numbers must not survive into the new hotel's view.
    writeCache('guest.content:["h1"]', { offers: [{ id: 1 }] });
    const screen = mount('guest.content:["h1"]');
    assert.equal(screen.state.data.offers.length, 1);

    const after = screen.setKey('guest.content:["h2"]');
    assert.equal(after.data, null, "the previous hotel's data stayed on screen");
    assert.equal(after.loading, true, "no loading state while the new hotel loads");
  });

  it("paints instantly when the new key is itself cached", () => {
    writeCache('guest.content:["h1"]', { offers: [] });
    writeCache('guest.content:["h2"]', { offers: [{ id: 2 }] });

    const screen = mount('guest.content:["h1"]');
    const after = screen.setKey('guest.content:["h2"]');

    assert.equal(after.loading, false);
    assert.equal(after.data.offers[0].id, 2);
  });
});

describe("what the user actually sees", () => {
  it("shows a loading state on the first visit to a tab", () => {
    const r = firstRender({ cacheKey: "guest.content", deps: ["h1"] });
    assert.equal(r.loading, true);
    assert.equal(r.data, null);
  });

  it("shows NO loading state on a return visit — the point of the feature", () => {
    const cold = firstRender({ cacheKey: "guest.content", deps: ["h1"] });
    writeCache(cold.key, { offers: [{ id: 1 }] });

    const warm = firstRender({ cacheKey: "guest.content", deps: ["h1"] });
    assert.equal(warm.loading, false, "the skeleton came back on a return visit");
    assert.equal(warm.data.offers.length, 1);
  });

  it("never shows one hotel's data on another hotel's screen", () => {
    writeCache("guest.content:[\"h1\"]", { offers: [{ id: 1 }] });
    const other = firstRender({ cacheKey: "guest.content", deps: ["h2"] });
    assert.equal(other.loading, true);
    assert.equal(other.data, null);
  });

  it("lets two screens share one entry when they share a key", () => {
    // Home and Offers both read the hotel's content under "guest.content".
    writeCache("guest.content:[\"h1\"]", { offers: [] });
    assert.ok(firstRender({ cacheKey: "guest.content", deps: ["h1"] }).hit);
  });

  it("leaves an opted-out call site behaving exactly as before", () => {
    const r = firstRender({ cacheKey: undefined });
    assert.equal(r.key, null);
    assert.equal(r.loading, true);
  });

  it("does not report loading when immediate is false", () => {
    assert.equal(firstRender({ cacheKey: "x", immediate: false }).loading, false);
  });

  it("starts the next user cold after a logout", () => {
    writeCache("guest.memberships:[]", { memberships: [{ id: "someone" }] });
    invalidateCache(); // what authSlice.logout() calls

    const r = firstRender({ cacheKey: "guest.memberships", deps: [] });
    assert.equal(r.data, null, "the previous user's data was served to the next one");
    assert.equal(r.loading, true);
  });

  it("refetches after a mutation invalidates the entry", () => {
    writeCache("hotel.dashboard:[]", { coins: 100 });
    invalidateCache("hotel.dashboard"); // what buying coins calls

    assert.equal(firstRender({ cacheKey: "hotel.dashboard" }).loading, true);
  });
});
