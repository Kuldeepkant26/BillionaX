/**
 * Tests for the month-end rebate's pure logic: period boundaries and the
 * credit calculation.
 *
 * Why these are the pieces worth pinning:
 *
 *  - A period window that is off by a millisecond either double-counts a
 *    redemption into two months or drops it from both. Neither throws; the
 *    money is just wrong, and the settlement row then LOCKS that wrong figure
 *    in, because a period is settled at most once.
 *
 *  - The credit must never round up. Paying out more than the agreed share
 *    across thousands of settlements is a real cost, and it is invisible in
 *    any single row.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let periodRange, previousPeriod, currentPeriod, computeRebate;
let periodLabel, runBlocker, distributionState, STALE_RUN_MS;

before(async () => {
  ({
    periodRange,
    previousPeriod,
    currentPeriod,
    computeRebate,
    periodLabel,
    runBlocker,
    distributionState,
    STALE_RUN_MS,
  } = await import("../src/services/rebate.service.js"));
});

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) =>
  readFileSync(join(here, rel), "utf8")
    // Comments explain the traps below in the same words the code uses, so a
    // naive match against the raw file would pass on the comment alone.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("periodRange", () => {
  it("starts at midnight on the 1st", () => {
    const { periodStart } = periodRange("2026-08");
    assert.equal(periodStart.getFullYear(), 2026);
    assert.equal(periodStart.getMonth(), 7); // 0-indexed August
    assert.equal(periodStart.getDate(), 1);
    assert.equal(periodStart.getHours(), 0);
    assert.equal(periodStart.getMinutes(), 0);
  });

  it("ends at the START of the next month, exclusive", () => {
    // Half-open [start, end). An inclusive end would either miss a redemption
    // at 23:59:59.999 on the 31st or double-count one at 00:00 on the 1st.
    const { periodEnd } = periodRange("2026-08");
    assert.equal(periodEnd.getMonth(), 8); // September
    assert.equal(periodEnd.getDate(), 1);
  });

  it("rolls the year over from December", () => {
    const { periodStart, periodEnd } = periodRange("2026-12");
    assert.equal(periodStart.getFullYear(), 2026);
    assert.equal(periodStart.getMonth(), 11);
    assert.equal(periodEnd.getFullYear(), 2027);
    assert.equal(periodEnd.getMonth(), 0);
  });

  it("handles February in a leap year", () => {
    const { periodStart, periodEnd } = periodRange("2028-02");
    // 29 days in Feb 2028; the window is defined by the next month's start, so
    // month length never has to be computed.
    const days = (periodEnd - periodStart) / 86_400_000;
    assert.equal(days, 29);
  });

  it("consecutive months tile with no gap and no overlap", () => {
    const aug = periodRange("2026-08");
    const sep = periodRange("2026-09");
    assert.equal(aug.periodEnd.getTime(), sep.periodStart.getTime());
  });

  for (const bad of ["2026-13", "2026-00", "2026-8", "26-08", "August", "", "2026"]) {
    it(`rejects malformed period ${JSON.stringify(bad)}`, () => {
      assert.throws(() => periodRange(bad), /Period must look like/);
    });
  }
});

describe("previousPeriod", () => {
  it("returns the prior month, zero-padded", () => {
    assert.equal(previousPeriod(new Date(2026, 7, 15)), "2026-07");
  });

  it("crosses the year boundary from January", () => {
    assert.equal(previousPeriod(new Date(2026, 0, 3)), "2025-12");
  });

  it("pads single-digit months", () => {
    assert.equal(previousPeriod(new Date(2026, 9, 1)), "2026-09");
  });
});

describe("currentPeriod", () => {
  it("formats the containing month", () => {
    assert.equal(currentPeriod(new Date(2026, 11, 31)), "2026-12");
  });
});

describe("computeRebate", () => {
  it("takes the configured share", () => {
    assert.equal(computeRebate(100_000, 50), 50_000);
  });

  it("floors rather than rounds — never overpay", () => {
    // 50% of 999 is 499.5. Rounding would hand out an extra coin every time.
    assert.equal(computeRebate(999, 50), 499);
  });

  it("floors a repeating fraction", () => {
    assert.equal(computeRebate(100, 33), 33);
  });

  it("returns 0 when the rate is 0", () => {
    assert.equal(computeRebate(100_000, 0), 0);
  });

  it("returns 0 for no redemptions", () => {
    assert.equal(computeRebate(0, 50), 0);
  });

  it("supports a full 100% pass-through", () => {
    assert.equal(computeRebate(1234, 100), 1234);
  });

  it("never exceeds the coins actually redeemed", () => {
    for (const coins of [1, 7, 99, 1000, 123_456]) {
      assert.ok(computeRebate(coins, 50) <= coins);
    }
  });
});

describe("periodLabel", () => {
  it("names the month in full", () => {
    assert.equal(periodLabel("2026-09"), "September 2026");
    assert.equal(periodLabel("2027-01"), "January 2027");
  });
});

/**
 * The once-per-month rule. A month distributed twice pays every hotel twice
 * (the per-hotel index would stop that, but only after the admin has watched
 * the button "work" a second time), so the run itself must refuse.
 */
describe("runBlocker", () => {
  const now = new Date(2026, 9, 7, 12, 0, 0);
  const base = { period: "2026-09", ratePercent: 50, now };

  it("lets a fresh month through", () => {
    assert.equal(runBlocker({ ...base, existingRun: null }), null);
  });

  it("refuses a month that is already complete", () => {
    const blocked = runBlocker({ ...base, existingRun: { status: "COMPLETE" } });
    assert.equal(blocked.status, 409);
    assert.match(blocked.message, /September 2026 have already been distributed/);
  });

  it("refuses while another run holds the month", () => {
    const startedAt = new Date(now.getTime() - 60_000);
    const blocked = runBlocker({ ...base, existingRun: { status: "RUNNING", startedAt } });
    assert.equal(blocked.status, 409);
    assert.match(blocked.message, /in progress/);
  });

  it("lets a run resume once the previous claim has gone stale", () => {
    // The process that claimed it died. Hotels it paid are protected by their
    // own unique index, so finishing the month is safe — and necessary, or the
    // rest of the network is never paid.
    const startedAt = new Date(now.getTime() - STALE_RUN_MS - 1);
    assert.equal(runBlocker({ ...base, existingRun: { status: "RUNNING", startedAt } }), null);
  });

  it("refuses a 0% rate rather than locking the month for nothing", () => {
    const blocked = runBlocker({ ...base, existingRun: null, ratePercent: 0 });
    assert.equal(blocked.status, 400);
  });

  it("refuses when the rate changed after the admin confirmed", () => {
    const blocked = runBlocker({ ...base, existingRun: null, expectedRatePercent: 40 });
    assert.equal(blocked.status, 409);
    assert.match(blocked.message, /changed to 50%/);
  });

  it("accepts the confirmed rate however it was serialised", () => {
    assert.equal(runBlocker({ ...base, existingRun: null, expectedRatePercent: "50" }), null);
  });

  it("checks completion before the rate — a done month says so first", () => {
    const blocked = runBlocker({
      ...base,
      existingRun: { status: "COMPLETE" },
      ratePercent: 0,
      expectedRatePercent: 30,
    });
    assert.match(blocked.message, /already been distributed/);
  });
});

describe("distributionState", () => {
  it("is OPEN while the month is still running", () => {
    assert.equal(distributionState({ isClosed: false, run: null, coinsRedeemed: 900 }), "OPEN");
  });

  it("is READY once closed with redemptions to pay", () => {
    assert.equal(distributionState({ isClosed: true, run: null, coinsRedeemed: 900 }), "READY");
  });

  it("is EMPTY when closed with nothing redeemed", () => {
    assert.equal(distributionState({ isClosed: true, run: null, coinsRedeemed: 0 }), "EMPTY");
  });

  it("is COMPLETE whatever the figures say once the run finished", () => {
    assert.equal(
      distributionState({ isClosed: true, run: { status: "COMPLETE" }, coinsRedeemed: 0 }),
      "COMPLETE"
    );
  });

  it("reports a run in flight", () => {
    assert.equal(
      distributionState({ isClosed: true, run: { status: "RUNNING" }, coinsRedeemed: 5 }),
      "RUNNING"
    );
  });
});

/**
 * `seenAt: null` in Mongo also matches a MISSING field. Every settlement
 * written before the announcement existed has no seenAt at all, so the plain
 * form would greet every manager with old payouts as if they had just landed.
 */
describe("unseen payouts ignore rows that predate the field", () => {
  const service = () => read("../src/services/rebate.service.js");

  it("queries seenAt by $type, never by bare null", () => {
    const src = service();
    // Two reads (the unseen list and markSeen), both by $type...
    assert.equal(src.match(/seenAt:\s*\{\s*\$type:\s*"null"\s*\}/g)?.length, 2);
    // ...and the ONE bare null is the write on create, checked below.
    assert.equal(src.match(/seenAt:\s*null\b/g)?.length, 1);
  });

  it("writes an explicit null on every new settlement", () => {
    const src = service();
    const create = src.slice(src.indexOf("RebateSettlement.create("));
    assert.match(create.slice(0, 600), /seenAt:\s*null/);
  });

  it("scopes markSeen to the caller's hotel", () => {
    const src = service();
    const fn = src.slice(src.indexOf("export const markSeen"));
    assert.match(fn, /_id:\s*settlementId,\s*hotelId/);
  });
});
