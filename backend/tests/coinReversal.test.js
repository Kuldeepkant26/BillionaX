/**
 * The main admin's Add coins, and reversing it within 24 hours.
 *
 * A reversal moves inventory back out of a hotel, so these pin the parts whose
 * failure is wrong money rather than a visible error. The behaviour itself
 * (rollback when the hotel has spent the coins, one winner among concurrent
 * reverses, the window) was run against a real replica set; these keep the
 * shape that makes it hold:
 *
 *  - Claim, inventory and invoice change in ONE transaction, the status and
 *    the window are in the claim's filter, and the inventory decrement is
 *    guarded on the hotel still holding the coins.
 *
 *  - The number shown in words, which is what makes a stray zero visible on
 *    the review step, is right in the Indian system.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PURCHASE_REVERSAL_HOURS, PURCHASE_STATUS } from "../src/config/constants.js";
import { numberInWords } from "../../frontend/src/utils/format.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const coinService = read("../src/services/coin.service.js");
const reverseBody = (() => {
  const start = coinService.indexOf("export const reversePurchase");
  const next = coinService.slice(start + 1).search(/\n(export )?const [a-zA-Z]+ = /);
  return coinService.slice(start, start + 1 + next);
})();

describe("the reversal window", () => {
  it("is 24 hours and reuses the existing VOID status", () => {
    assert.equal(PURCHASE_REVERSAL_HOURS, 24);
    assert.equal(PURCHASE_STATUS.VOID, "VOID");
  });
});

describe("reversing a coin credit", () => {
  it("runs inside one transaction", () => {
    assert.match(reverseBody, /session\.withTransaction\(/);
    assert.match(reverseBody, /endSession\(\)/);
  });

  it("claims only a COMPLETED credit inside the window, in the same filter", () => {
    assert.match(
      reverseBody,
      /findOneAndUpdate\(\s*\{[^}]*status: PURCHASE_STATUS\.COMPLETED,\s*createdAt: \{ \$gte: cutoff \}/s
    );
    assert.match(reverseBody, /status: PURCHASE_STATUS\.VOID/);
  });

  it("is scoped to the hotel in the URL", () => {
    assert.match(reverseBody, /\{ _id: purchaseId, hotelId, status:/);
  });

  it("takes the coins back only from a hotel that still holds them", () => {
    assert.match(reverseBody, /coinInventory: \{ \$gte: purchase\.coins \}/);
    assert.match(reverseBody, /\$inc: \{ coinInventory: -purchase\.coins, totalCoinsPurchased: -purchase\.coins \}/);
  });

  it("voids the invoice with the transaction's session", () => {
    assert.match(reverseBody, /voidInvoiceForPurchase\(purchase\._id, \{[^}]*session/);
  });

  it("tells the hotel only after the commit", () => {
    const committed = reverseBody.indexOf("await session.endSession()");
    const emitted = reverseBody.indexOf('emitToHotel(hotelId, "hotel:inventory"');
    assert.ok(committed > 0 && emitted > committed, "emit must come after the transaction");
  });

  it("is routed for the main admin with both ids validated", () => {
    const routes = read("../src/routes/admin.routes.js");
    assert.match(
      routes,
      /"\/hotels\/:hotelId\/purchases\/:purchaseId\/reverse",\s*objectIdParam\("hotelId"\),\s*objectIdParam\("purchaseId"\),\s*reversePurchaseRules,\s*validate,\s*adminController\.reversePurchase/
    );
    // Everything in the file sits behind this.
    assert.match(routes, /router\.use\(protect, requireRole\(ROLES\.MAIN_ADMIN\)\)/);
  });
});

describe("a reversed credit's invoice", () => {
  const invoiceService = read("../src/services/invoice.service.js");

  it("is marked void, never rewritten or deleted", () => {
    assert.match(invoiceService, /\{ purchaseId, voidedAt: null \},\s*\{ \$set: \{ voidedAt:/);
  });

  it("cannot be emailed again", () => {
    assert.match(invoiceService, /if \(invoice\.voidedAt\) throw new ApiError\(409/);
  });

  it("drops out of the transactions feed", () => {
    assert.match(coinService, /const query = \{ status: PURCHASE_STATUS\.COMPLETED \}/);
  });
});

describe("numbers in words, the Indian way", () => {
  it("reads lakh and crore", () => {
    assert.equal(numberInWords(100000), "One lakh");
    assert.equal(numberInWords(1000000), "Ten lakh");
    assert.equal(numberInWords(2550000), "Twenty-five lakh fifty thousand");
    assert.equal(numberInWords(10000000), "One crore");
    assert.equal(
      numberInWords(1234567890),
      "One hundred twenty-three crore forty-five lakh sixty-seven thousand eight hundred ninety"
    );
  });

  it("reads the small and awkward ones", () => {
    assert.equal(numberInWords(0), "Zero");
    assert.equal(numberInWords(105), "One hundred five");
    assert.equal(numberInWords(12345), "Twelve thousand three hundred forty-five");
    assert.equal(numberInWords(95000), "Ninety-five thousand");
  });

  it("makes an extra zero look different", () => {
    assert.notEqual(numberInWords(100000), numberInWords(1000000));
  });
});

describe("the admin panel", () => {
  const page = strip(read("../../frontend/src/pages/admin/HotelDetailPage.jsx"));

  it("says Add coins, not Sell coins", () => {
    assert.match(page, />Add coins</);
    assert.doesNotMatch(page, /Sell coins/);
  });

  it("reviews the figure in words before adding", () => {
    assert.match(page, /sellStep === "review"/);
    assert.match(page, /numberInWords\(coins\)/);
    assert.match(page, /`Add \$\{formatCoins\(sellCoinsNum\)\} coins`/);
  });

  it("offers Reverse and calls the endpoint", () => {
    assert.match(page, /reversePurchase\(hotelId, reverseTarget\._id/);
  });
});
