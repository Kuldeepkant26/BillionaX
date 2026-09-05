/**
 * Tests for the bill's money arithmetic.
 *
 * Why these are the pieces worth pinning:
 *
 *  - The split must sum EXACTLY to what was captured. floor(5%) + floor(95%)
 *    is a paisa short of the total for most amounts, and a Route transfer set
 *    that does not add up is rejected outright — so this fails at the gateway,
 *    on a real payment, not in development.
 *
 *  - Paise and rupees coexist in this codebase: the new Bill is paise, the coin
 *    ledger it writes into is rupees. A value crossing that boundary in the
 *    wrong unit is a 100x error that throws nothing, looks plausible in the UI,
 *    and inflates every month-end rebate settlement built on top of it.
 *
 *  - The tier cap is what stops a guest discounting an entire bill to zero.
 *    It is the hotel's money at stake, and nothing downstream re-checks it.
 */
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

let toPaise, toRupees, computeBillTotals, computeBillSplit, computeBillCoins;

before(async () => {
  ({ toPaise, toRupees, computeBillTotals, computeBillSplit, computeBillCoins } = await import(
    "../src/utils/coinMath.js"
  ));
});

describe("toPaise / toRupees", () => {
  it("converts whole rupees", () => {
    assert.equal(toPaise(1), 100);
    assert.equal(toPaise(4500), 450000);
    assert.equal(toRupees(450000), 4500);
  });

  it("rounds rather than truncates on the way in", () => {
    // 45.55 is not representable in binary floating point; 45.55 * 100 is
    // 4554.999999999999. Truncating would lose a paisa on ordinary prices.
    assert.equal(toPaise(45.55), 4555);
    assert.equal(toPaise(0.1 + 0.2), 30);
  });

  it("floors on the way out, so a partial rupee never credits a whole one", () => {
    assert.equal(toRupees(4599), 45);
    assert.equal(toRupees(99), 0);
  });
});

describe("computeBillTotals", () => {
  it("multiplies quantity by unit price and sums", () => {
    const { subtotalPaise, taxPaise, totalPaise } = computeBillTotals({
      lineItems: [
        { qty: 2, unitPricePaise: 45000 }, // 2 x ₹450
        { qty: 1, unitPricePaise: 12050 }, // 1 x ₹120.50
      ],
      taxPercent: 0,
    });

    assert.equal(subtotalPaise, 102050);
    assert.equal(taxPaise, 0);
    assert.equal(totalPaise, 102050);
  });

  it("applies tax to the subtotal once, not per line", () => {
    // Per-line tax would round three times and land short.
    const { taxPaise, totalPaise } = computeBillTotals({
      lineItems: [
        { qty: 1, unitPricePaise: 33333 },
        { qty: 1, unitPricePaise: 33333 },
        { qty: 1, unitPricePaise: 33333 },
      ],
      taxPercent: 18,
    });

    assert.equal(taxPaise, Math.floor((99999 * 18) / 100));
    assert.equal(totalPaise, 99999 + taxPaise);
  });

  it("is zero for an empty bill rather than NaN", () => {
    const totals = computeBillTotals({ lineItems: [], taxPercent: 18 });
    assert.deepEqual(totals, { subtotalPaise: 0, taxPaise: 0, totalPaise: 0 });
  });

  it("ignores malformed quantities and prices instead of producing NaN", () => {
    // A NaN total would be stored, rendered as "₹NaN", and sent to the gateway.
    const { totalPaise } = computeBillTotals({
      lineItems: [
        { qty: "2", unitPricePaise: "100" },
        { qty: null, unitPricePaise: 500 },
        { qty: 1, unitPricePaise: undefined },
        { qty: -3, unitPricePaise: 900 },
      ],
      taxPercent: 0,
    });
    assert.equal(totalPaise, 200);
  });
});

describe("computeBillSplit", () => {
  it("takes the platform's share and leaves the rest to the hotel", () => {
    const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
      payablePaise: 450000,
      feePercent: 5,
    });

    assert.equal(platformCommissionPaise, 22500); // ₹225
    assert.equal(hotelAmountPaise, 427500); // ₹4,275
  });

  it("ALWAYS sums to exactly the payable amount", () => {
    // The invariant Razorpay Route enforces. Checked across amounts chosen to
    // land badly on a 5% boundary.
    for (let payablePaise = 1; payablePaise <= 20000; payablePaise += 7) {
      const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
        payablePaise,
        feePercent: 5,
      });
      assert.equal(
        platformCommissionPaise + hotelAmountPaise,
        payablePaise,
        `split lost a paisa at ${payablePaise}`
      );
    }
  });

  it("sums exactly at every whole fee percent", () => {
    for (let feePercent = 0; feePercent <= 100; feePercent += 1) {
      const payablePaise = 123457; // deliberately prime-ish and odd
      const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
        payablePaise,
        feePercent,
      });
      assert.equal(platformCommissionPaise + hotelAmountPaise, payablePaise);
    }
  });

  it("never rounds the commission up", () => {
    // 99 paise at 5% is 4.95 paise. Rounding up would take money the platform
    // is not owed, on every single transaction.
    const { platformCommissionPaise } = computeBillSplit({ payablePaise: 99, feePercent: 5 });
    assert.equal(platformCommissionPaise, 4);
  });

  it("gives the hotel everything at a zero fee", () => {
    const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
      payablePaise: 10000,
      feePercent: 0,
    });
    assert.equal(platformCommissionPaise, 0);
    assert.equal(hotelAmountPaise, 10000);
  });

  it("handles a fully-discounted bill without going negative", () => {
    const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
      payablePaise: 0,
      feePercent: 5,
    });
    assert.equal(platformCommissionPaise, 0);
    assert.equal(hotelAmountPaise, 0);
  });
});

describe("computeBillCoins", () => {
  const base = { balance: 100000, totalPaise: 500000, tierCapPercent: 20 };

  it("applies what the guest asked for when it is within every bound", () => {
    const result = computeBillCoins({ ...base, coinsRequested: 500 });
    assert.equal(result.coinsApplied, 500);
    assert.equal(result.coinsDiscountPaise, 50000); // ₹500
    assert.equal(result.payablePaise, 450000); // ₹4,500
  });

  it("clamps to the tier cap", () => {
    // 20% of ₹5,000 is ₹1,000, however many coins the guest holds or asks for.
    const result = computeBillCoins({ ...base, coinsRequested: 999999 });
    assert.equal(result.capCoins, 1000);
    assert.equal(result.coinsApplied, 1000);
    assert.equal(result.payablePaise, 400000);
  });

  it("clamps to the guest's balance", () => {
    const result = computeBillCoins({ ...base, balance: 300, coinsRequested: 900 });
    assert.equal(result.coinsApplied, 300);
  });

  it("never returns a negative payable or negative coins", () => {
    const result = computeBillCoins({
      ...base,
      coinsRequested: -50,
      tierCapPercent: 100,
    });
    assert.equal(result.coinsApplied, 0);
    assert.equal(result.payablePaise, 500000);
  });

  it("allows a bill to be settled entirely in coins at a 100% cap", () => {
    const result = computeBillCoins({
      balance: 100000,
      totalPaise: 500000,
      tierCapPercent: 100,
      coinsRequested: 5000,
    });
    assert.equal(result.coinsApplied, 5000);
    assert.equal(result.payablePaise, 0);
  });

  it("applies nothing at a zero cap", () => {
    const result = computeBillCoins({ ...base, tierCapPercent: 0, coinsRequested: 500 });
    assert.equal(result.coinsApplied, 0);
    assert.equal(result.payablePaise, 500000);
  });

  it("floors the cap to whole coins so a part-rupee cap cannot over-discount", () => {
    // 20% of ₹99.99 is ₹19.998 -> 19 whole coins, not 20.
    const result = computeBillCoins({
      balance: 100000,
      totalPaise: 9999,
      tierCapPercent: 20,
      coinsRequested: 100,
    });
    assert.equal(result.capCoins, 19);
    assert.equal(result.payablePaise, 9999 - 1900);
  });
});

describe("the rupee/paise boundary (regression: R1)", () => {
  it("a bill total converts to the rupee figure the coin ledger stores", () => {
    // CoinTransaction.billAmount is RUPEES, and rebate.service.js aggregates it
    // as rupees. Writing totalPaise into that field would inflate every
    // month-end settlement by 100x, silently.
    const { totalPaise } = computeBillTotals({
      lineItems: [{ qty: 1, unitPricePaise: 450000 }],
      taxPercent: 0,
    });

    assert.equal(totalPaise, 450000);
    assert.equal(toRupees(totalPaise), 4500);
  });

  it("the full chain holds together on a realistic bill", () => {
    // ₹5,000 bill, 18% tax, guest applies 500 coins, 5% platform fee.
    const { totalPaise } = computeBillTotals({
      lineItems: [{ qty: 2, unitPricePaise: 250000 }],
      taxPercent: 18,
    });
    assert.equal(totalPaise, 590000); // ₹5,900

    const { coinsApplied, payablePaise } = computeBillCoins({
      coinsRequested: 500,
      balance: 5000,
      totalPaise,
      tierCapPercent: 20,
    });
    assert.equal(coinsApplied, 500);
    assert.equal(payablePaise, 540000); // ₹5,400

    const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
      payablePaise,
      feePercent: 5,
    });
    assert.equal(platformCommissionPaise, 27000); // ₹270
    assert.equal(hotelAmountPaise, 513000); // ₹5,130
    assert.equal(platformCommissionPaise + hotelAmountPaise, payablePaise);

    // What the REDEEM ledger row must carry, in rupees.
    assert.equal(toRupees(totalPaise), 5900);
    assert.equal(toRupees(payablePaise), 5400);
  });
});
