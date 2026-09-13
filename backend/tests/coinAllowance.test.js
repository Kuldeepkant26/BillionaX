/**
 * Per-service coin allowances.
 *
 * These pin the two things that fail SILENTLY — a wrong allowance looks exactly
 * like a right one, and the error is money:
 *
 *   - A 0% service must stay 0. Every fallback in this feature has a legitimate
 *     zero, and a single `||` anywhere promotes "coins are not accepted at the
 *     spa" into the guest's full tier allowance.
 *   - A bill raised before services existed must price exactly as it did. Bills
 *     are financial history; there is no migration that could invent per-line
 *     services for one nobody itemised that way.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCoinAllowance, computeBillCoins } from "../src/utils/coinMath.js";

/** ₹x as paise, for readability in the cases below. */
const rs = (rupees) => rupees * 100;

/** A caps map in the shape resolveServiceCaps returns. */
const capsFor = (map) => (line) =>
  line?.service ? map.get(String(line.service).toLowerCase()) ?? null : null;

/**
 * Per-tier caps, resolved the way priceBill does it: the map holds all three
 * rates and the caller applies the bill's own tier.
 */
describe("per-tier service caps", () => {
  const perTier = new Map([
    ["restaurant", { SILVER: 20, GOLD: 35, PLATINUM: 50 }],
    ["spa", { SILVER: 0, GOLD: 0, PLATINUM: 0 }],
  ]);

  const capsForTier = (tier) => (line) => {
    if (!line?.service || !tier) return null;
    return perTier.get(String(line.service).toLowerCase())?.[tier] ?? null;
  };

  const lines = [
    { amountPaise: rs(2000), service: "Restaurant" },
    { amountPaise: rs(3000), service: "Spa" },
  ];

  it("prices the same bill differently for each tier", () => {
    const at = (tier) =>
      computeCoinAllowance({
        lineItems: lines,
        totalPaise: rs(5000),
        tierCapPercent: 10,
        capPercentFor: capsForTier(tier),
      }).allowancePaise;

    assert.equal(at("SILVER"), rs(400));
    assert.equal(at("GOLD"), rs(700));
    assert.equal(at("PLATINUM"), rs(1000));
  });

  it("keeps a 0% service at zero for every tier", () => {
    // The rate a hotel set to zero must not be rescued by a higher tier's
    // generosity, nor by the tier cap behind it.
    for (const tier of ["SILVER", "GOLD", "PLATINUM"]) {
      const { allowancePaise } = computeCoinAllowance({
        lineItems: [{ amountPaise: rs(3000), service: "Spa" }],
        totalPaise: rs(3000),
        tierCapPercent: 30,
        capPercentFor: capsForTier(tier),
      });
      assert.equal(allowancePaise, 0, `${tier} must get nothing at a 0% service`);
    }
  });

  it("falls back to the tier cap when the tier is unknown", () => {
    // A bill whose tier could not be resolved must not silently take one
    // service's rate — it takes the guest's own cap, as before services.
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(1000), service: "Restaurant" }],
      totalPaise: rs(1000),
      tierCapPercent: 10,
      capPercentFor: capsForTier(null),
    });
    assert.equal(allowancePaise, rs(100));
  });
});

describe("computeCoinAllowance", () => {
  const caps = new Map([
    ["restaurant", 20],
    ["spa", 0],
  ]);

  it("sums each line's own share — the headline case", () => {
    // ₹2000 Restaurant at 20% = ₹400, ₹3000 Spa at 0% = ₹0.
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [
        { amountPaise: rs(2000), service: "Restaurant" },
        { amountPaise: rs(3000), service: "Spa" },
      ],
      totalPaise: rs(5000),
      capPercentFor: capsFor(caps),
    });

    assert.equal(allowancePaise, rs(400));
  });

  it("gives zero on a bill of nothing but a 0% service", () => {
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(3000), service: "Spa" }],
      totalPaise: rs(3000),
      // A generous tier cap that must NOT be reached for.
      tierCapPercent: 30,
      capPercentFor: capsFor(caps),
    });

    assert.equal(allowancePaise, 0);
  });

  it("does NOT fall back to the tier cap when a service says 0", () => {
    // The `??` vs `||` bug, pinned directly: `0 || 30` is 30.
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(1000), service: "Spa" }],
      totalPaise: rs(1000),
      tierCapPercent: 30,
      capPercentFor: () => 0,
    });

    assert.equal(allowancePaise, 0, "a 0% service must not be promoted to the tier cap");
  });

  it("falls back to the tier cap for a line with no service", () => {
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(1000) }],
      totalPaise: rs(1000),
      tierCapPercent: 30,
      capPercentFor: capsFor(caps),
    });

    assert.equal(allowancePaise, rs(300));
  });

  it("falls back for a service name the hotel does not have", () => {
    // An unrecognised name must never be more permissive than today.
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(1000), service: "Helipad" }],
      totalPaise: rs(1000),
      tierCapPercent: 10,
      capPercentFor: capsFor(caps),
    });

    assert.equal(allowancePaise, rs(100));
  });

  it("matches the service name case-insensitively", () => {
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(1000), service: "SPA" }],
      totalPaise: rs(1000),
      tierCapPercent: 30,
      capPercentFor: capsFor(caps),
    });

    assert.equal(allowancePaise, 0);
  });

  it("grosses up by tax once, so a 100% service can settle a bill in full", () => {
    // ₹1000 at 100% = ₹1000 base, +18% tax = ₹1180, which is the whole bill.
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(1000), service: "All in" }],
      taxPercent: 18,
      totalPaise: rs(1180),
      capPercentFor: () => 100,
    });

    assert.equal(allowancePaise, rs(1180));
  });

  it("never authorises more than the bill is worth", () => {
    // A clamp against a totalPaise that disagrees with the lines.
    const { allowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: rs(5000), service: "All in" }],
      totalPaise: rs(100),
      capPercentFor: () => 100,
    });

    assert.equal(allowancePaise, rs(100));
  });

  it("floors each line, never rounding up", () => {
    // ₹10.05 at 33% is 331.65 paise -> 331.
    const { perLineAllowancePaise, baseAllowancePaise } = computeCoinAllowance({
      lineItems: [{ amountPaise: 1005, service: "x" }],
      totalPaise: 1005,
      capPercentFor: () => 33,
    });

    assert.equal(perLineAllowancePaise[0], 331);
    assert.equal(baseAllowancePaise, 331);
  });

  it("treats an empty bill as zero rather than throwing", () => {
    const { allowancePaise } = computeCoinAllowance({ lineItems: [], totalPaise: 0 });
    assert.equal(allowancePaise, 0);
  });
});

describe("computeBillCoins", () => {
  it("reproduces the pre-services numbers exactly when no allowance is given", () => {
    // The back-compat guarantee: every existing caller omits the new argument
    // and must be unaffected. 20% of ₹5000 is ₹1000.
    const out = computeBillCoins({
      coinsRequested: 99999,
      balance: 99999,
      totalPaise: rs(5000),
      tierCapPercent: 20,
    });

    assert.equal(out.capCoins, 1000);
    assert.equal(out.coinsApplied, 1000);
    assert.equal(out.payablePaise, rs(4000));
  });

  it("prefers a frozen allowance over the tier percentage", () => {
    const out = computeBillCoins({
      coinsRequested: 99999,
      balance: 99999,
      totalPaise: rs(5000),
      // A tier cap that would give ₹1500 is deliberately ignored.
      tierCapPercent: 30,
      coinAllowancePaise: rs(400),
    });

    assert.equal(out.coinsApplied, 400);
    assert.equal(out.payablePaise, rs(4600));
  });

  it("treats a frozen allowance of 0 as zero, not as absent", () => {
    // The single highest-severity bug this feature could ship: a spa-only bill
    // handed the guest's whole tier allowance.
    const out = computeBillCoins({
      coinsRequested: 99999,
      balance: 99999,
      totalPaise: rs(3000),
      tierCapPercent: 30,
      coinAllowancePaise: 0,
    });

    assert.equal(out.capCoins, 0);
    assert.equal(out.coinsApplied, 0);
    assert.equal(out.payablePaise, rs(3000));
  });

  it("still clamps to the guest's balance and their request", () => {
    const poor = computeBillCoins({
      coinsRequested: 99999,
      balance: 50,
      totalPaise: rs(5000),
      coinAllowancePaise: rs(400),
    });
    assert.equal(poor.coinsApplied, 50);

    const modest = computeBillCoins({
      coinsRequested: 25,
      balance: 99999,
      totalPaise: rs(5000),
      coinAllowancePaise: rs(400),
    });
    assert.equal(modest.coinsApplied, 25);
  });

  it("never lets an oversized allowance drive the payable negative", () => {
    const out = computeBillCoins({
      coinsRequested: 99999,
      balance: 99999,
      totalPaise: rs(100),
      coinAllowancePaise: rs(9999),
    });

    assert.equal(out.coinsApplied, 100);
    assert.equal(out.payablePaise, 0);
  });

  it("refuses a negative request", () => {
    const out = computeBillCoins({
      coinsRequested: -500,
      balance: 99999,
      totalPaise: rs(5000),
      coinAllowancePaise: rs(400),
    });

    assert.equal(out.coinsApplied, 0);
    assert.equal(out.payablePaise, rs(5000));
  });
});
