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

let periodRange, previousPeriod, currentPeriod, computeRebate;

before(async () => {
  ({ periodRange, previousPeriod, currentPeriod, computeRebate } = await import(
    "../src/services/rebate.service.js"
  ));
});

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
