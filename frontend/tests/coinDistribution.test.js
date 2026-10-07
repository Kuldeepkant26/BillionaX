/**
 * The coin distribution tab and the hotel's "coins received" announcement.
 *
 * Two kinds of check, for two kinds of failure:
 *
 *  - The arithmetic. computeRebate previews money and MUST floor exactly like
 *    the backend, and splitCoins drives the counters the admin watches — if the
 *    shares did not add up, a hotel's counter would stop short of its payout.
 *
 *  - The wiring. A realtime announcement that nothing mounts silently never
 *    runs; this project has shipped exactly that bug before (see the memory
 *    note on useHotelBillRealtime). And test mode exists to demo the feature,
 *    so it must not be able to reach the endpoint that moves coins.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  computeRebate,
  splitCoins,
  particlePlan,
  periodLabel,
  periodOptions,
  shiftPeriod,
  showRows,
  sampleRows,
  bezier,
  easeInOutCubic,
} from "../src/features/panel/distribution/distributionMath.js";

const here = dirname(fileURLToPath(import.meta.url));
/** Source with comments stripped — a commented-out call must not pass. */
const code = (rel) =>
  readFileSync(join(here, "..", rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");

describe("computeRebate mirrors the backend", () => {
  it("floors, never rounds", () => {
    assert.equal(computeRebate(999, 50), 499);
    assert.equal(computeRebate(100, 33), 33);
  });

  it("is zero for nothing redeemed or a zero rate", () => {
    assert.equal(computeRebate(0, 50), 0);
    assert.equal(computeRebate(1000, 0), 0);
  });

  it("accepts the slider's string value", () => {
    assert.equal(computeRebate(1000, "60"), 600);
  });
});

describe("splitCoins", () => {
  for (const [total, parts] of [
    [500, 7],
    [1, 5],
    [999, 34],
    [123_457, 34],
    [10, 10],
  ]) {
    it(`${total} over ${parts} adds up exactly, in whole coins`, () => {
      const shares = splitCoins(total, parts);
      assert.equal(shares.length, parts);
      assert.equal(shares.reduce((s, n) => s + n, 0), total);
      assert.ok(shares.every((n) => Number.isInteger(n) && n >= 0));
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
    });
  }
});

describe("particlePlan", () => {
  it("gives every paid hotel a visible stream", () => {
    const plan = particlePlan([100_000, 50]);
    assert.ok(plan[1] >= 5);
    assert.ok(plan[0] > plan[1]);
  });

  it("sends nothing to a hotel with no payout", () => {
    assert.deepEqual(particlePlan([500, 0]).slice(1), [0]);
  });

  it("stays inside the budget on a large network", () => {
    const plan = particlePlan(Array.from({ length: 80 }, (_, i) => 1000 + i * 500));
    assert.ok(plan.reduce((s, n) => s + n, 0) <= 420 + 80);
    assert.ok(plan.every((n) => n >= 2));
  });
});

describe("periods", () => {
  it("labels a month", () => {
    assert.equal(periodLabel("2026-09"), "September 2026");
  });

  it("lists months newest first across a year boundary", () => {
    assert.deepEqual(periodOptions("2026-02", 4), ["2026-02", "2026-01", "2025-12", "2025-11"]);
  });

  it("shifts forward over December", () => {
    assert.equal(shiftPeriod("2026-12", 1), "2027-01");
    assert.equal(shiftPeriod("2026-01", -1), "2025-12");
  });
});

describe("showRows", () => {
  const overview = {
    ratePercent: 50,
    rows: [
      { hotelId: "a", name: "A", coinsRedeemed: 1000, settlement: null },
      { hotelId: "b", name: "B", coinsRedeemed: 4000, settlement: { coinsCredited: 1600 } },
      { hotelId: "c", name: "C", coinsRedeemed: 1, settlement: null },
      { hotelId: "d", name: "D", coinsRedeemed: 0, settlement: null },
    ],
  };

  it("projects at the given rate, biggest first, dropping zero payouts", () => {
    const rows = showRows(overview, { source: "projected", ratePercent: 60 });
    assert.deepEqual(
      rows.map((r) => [r.hotelId, r.coins]),
      [
        ["b", 1600],
        ["a", 600],
      ]
    );
  });

  it("never re-forecasts a hotel that has already been paid", () => {
    const b = showRows(overview, { source: "projected", ratePercent: 10 }).find((r) => r.hotelId === "b");
    assert.equal(b.coins, 1600);
  });

  it("shows only what was actually credited", () => {
    assert.deepEqual(
      showRows(overview, { source: "credited" }).map((r) => r.hotelId),
      ["b"]
    );
  });
});

describe("sample hotels for test mode", () => {
  it("are deterministic and follow the rate", () => {
    assert.deepEqual(sampleRows(50), sampleRows(50));
    const at50 = sampleRows(50)[0];
    assert.equal(at50.coins, computeRebate(at50.redeemed, 50));
  });

  it("are marked as samples by id, so they can never be mistaken for a hotel", () => {
    assert.ok(sampleRows(50).every((r) => r.hotelId.startsWith("sample-")));
  });
});

describe("flight maths", () => {
  it("bezier hits both endpoints", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 50 };
    assert.deepEqual(bezier(a, { x: 50, y: -80 }, b, 0), a);
    assert.deepEqual(bezier(a, { x: 50, y: -80 }, b, 1), b);
  });

  it("easing starts at 0 and lands at 1", () => {
    assert.equal(easeInOutCubic(0), 0);
    assert.equal(easeInOutCubic(1), 1);
  });
});

describe("wiring", () => {
  it("the hotel panel actually renders the announcement", () => {
    const src = code("src/components/layout/HotelPanelLayout.jsx");
    assert.match(src, /import RebateNotice from/);
    assert.match(src, /<RebateNotice\s*\/>/);
  });

  it("the announcement listens for the live push the server emits", () => {
    const src = code("src/features/panel/distribution/RebateNotice.jsx");
    assert.match(src, /socket\.on\("rebate:credited"/);
    assert.match(src, /socket\.off\("rebate:credited"/);
  });

  it("the admin panel mounts the distribution badge", () => {
    const src = code("src/components/layout/AdminPanelLayout.jsx");
    assert.match(src, /useDistributionBadge\(\)/);
    assert.match(src, /badge: "distribution"/);
    assert.match(code("src/components/layout/PanelLayout.jsx"), /distribution: distributionPending/);
  });

  it("marks a payout seen with an object body, never null", () => {
    // axios sends null as the literal "null", which express.json 400s.
    const src = code("src/api/hotel.api.js");
    assert.match(src, /\/hotel\/rebates\/\$\{id\}\/seen`, \{\}\)/);
  });

  it("test mode cannot reach the endpoint that moves coins", () => {
    const src = code("src/pages/admin/AdminDistributionPage.jsx");
    // runRebate is called from exactly one place...
    assert.equal(src.match(/runRebate\(/g)?.length, 1);
    // ...inside `distribute`, which test mode never invokes.
    const distribute = src.slice(src.indexOf("const distribute"), src.indexOf("const startTest"));
    assert.match(distribute, /runRebate\(/);
    const startTest = src.slice(src.indexOf("const startTest"), src.indexOf("const replayCompleted"));
    assert.doesNotMatch(startTest, /runRebate|distribute\(/);
    // and the test-mode button is wired to startTest.
    assert.match(src, /if \(testMode\) return \{ label: "Run test distribution", onClick: startTest/);
  });
});
