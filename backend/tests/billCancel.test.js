/**
 * The bill-cancellation and bill-history contracts.
 *
 * These pin the parts that were actually broken, and the parts whose failure
 * mode is silence rather than an error:
 *
 *  - The panel's realtime subscription. The server emitted bill:paid and
 *    bill:cancelled to the hotel room and NOTHING in the panel listened, so a
 *    guest could pay at the desk and the screen kept showing the bill as
 *    pending. Nothing errored; the status simply never moved.
 *
 *  - Who may void a bill. A staff member voiding another's bill, or a bill at
 *    another hotel, must be refused — and the tenant check must come first, so
 *    a wrong-hotel id reads as "not found" rather than leaking that it exists.
 *
 *  - Bill history must stay OUT of the coin ledger. CoinTransaction is
 *    append-only and sum(coins) === balance is its integrity check; cancelled
 *    and cash-only bills move no coins, so they belong to a separate feed.
 *
 * No database here. These read the source and exercise the pure decision
 * logic, which is where the bugs were — the Mongo paths need a live server and
 * are covered by the existing integration flow.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { BILL_STATUS, TX_TYPE_VALUES } from "../src/config/constants.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");

const billService = read("../src/services/bill.service.js");
const hotelRoutes = read("../src/routes/hotel.routes.js");
const hotelController = read("../src/controllers/hotel.controller.js");
const billPage = read("../../frontend/src/pages/hotel/BillPage.jsx");
const billRealtime = read("../../frontend/src/hooks/useBillRealtime.js");

describe("the hotel panel subscribes to its own bill events", () => {
  it("defines a staff-side realtime hook", () => {
    assert.match(billRealtime, /export const useHotelBillRealtime/);
  });

  it("listens for paid and cancelled, not just new bills", () => {
    for (const event of ["bill:new", "bill:paid", "bill:cancelled", "bill:expired"]) {
      assert.ok(
        billRealtime.includes(`"${event}"`),
        `the staff hook ignores ${event}, so the panel would not update on it`
      );
    }
  });

  it("is actually CALLED by the bill page", () => {
    // The original bug in one assertion: the hook existed and was correct, and
    // nothing imported it.
    //
    // Comments are stripped before matching — a commented-out call satisfies a
    // naive regex, which is exactly the state the code was already in (a stale
    // comment claimed the list was "refreshed live by the socket" while
    // nothing subscribed at all).
    const code = billPage
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    assert.match(code, /import \{[^}]*useHotelBillRealtime/s, "hook not imported");
    assert.match(code, /^\s*useHotelBillRealtime\(/m, "hook imported but never called");
  });

  it("passes a stable callback, so it does not resubscribe every render", () => {
    // An inline arrow would tear down and re-open the socket listeners on each
    // render — the listeners would still work, but the churn is a real leak
    // risk and the hook's dependency array is written expecting stability.
    assert.match(billPage, /useCallback\(\(\) => reloadBills\(\)/);
  });
});

describe("who may void a bill", () => {
  it("exposes a staff cancel path", () => {
    assert.match(billService, /export const cancelBillByStaff/);
  });

  it("checks the hotel BEFORE the ownership rule", () => {
    // Order matters: a bill at another hotel must 404, not 403. A 403 would
    // confirm the bill exists to someone with no right to know it.
    const fn = billService.slice(billService.indexOf("export const cancelBillByStaff"));
    const hotelCheck = fn.indexOf("Bill not found");
    const ownerCheck = fn.indexOf("only cancel a bill you sent");

    assert.ok(hotelCheck > -1 && ownerCheck > -1, "both checks must exist");
    assert.ok(hotelCheck < ownerCheck, "ownership is checked before the tenant boundary");
  });

  it("scopes the lookup by hotelId, not by bill id alone", () => {
    const fn = billService.slice(billService.indexOf("export const cancelBillByStaff"));
    assert.match(fn, /Bill\.findOne\(\{ _id: billId, hotelId \}\)/);
  });

  it("lets an admin void any bill but staff only their own", () => {
    const fn = billService.slice(billService.indexOf("export const cancelBillByStaff"));
    assert.match(fn, /!isAdmin && String\(existing\.staffId\) !== String\(staffId\)/);
  });

  it("uses the status filter as the mutex, so a paid bill cannot be voided", () => {
    // Same guard as every other state change here: the update only matches a
    // PENDING row, so a bill paid a moment ago cannot be retroactively voided.
    const fn = billService.slice(billService.indexOf("export const cancelBillByStaff"));
    assert.match(fn, /status: BILL_STATUS\.PENDING/);
  });

  it("derives isAdmin from the role rather than trusting the client", () => {
    const fn = hotelController.slice(hotelController.indexOf("export const cancelBill"));
    assert.match(fn, /isAdmin: req\.user\.role === ROLES\.HOTEL_ADMIN/);
  });

  it("routes the endpoint with an id validator", () => {
    assert.match(hotelRoutes, /bills\/:billId\/cancel/);
    assert.match(hotelRoutes, /objectIdParam\("billId"\)/);
  });

  it("tells the guest their bill was voided, flagged as the hotel's doing", () => {
    // The guest's Pay screen is holding the bill open; without this they could
    // pay something the desk has just withdrawn. byStaff separates it from the
    // echo of the guest's own decline.
    const fn = billService.slice(billService.indexOf("export const cancelBillByStaff"));
    assert.match(fn, /emitToGuest\([^)]*"bill:cancelled"[^)]*byStaff: true/s);
  });
});

describe("bill history stays out of the coin ledger", () => {
  it("has no ledger type for a bill that moved no coins", () => {
    // If one is ever added, sum(coins) === balance stops being a valid check
    // and every revenue aggregate needs a new exclusion.
    for (const bogus of ["BILL_PAID", "BILL_CANCELLED", "CANCELLED"]) {
      assert.ok(!TX_TYPE_VALUES.includes(bogus), `${bogus} leaked into the coin ledger`);
    }
  });

  it("reads history from the bills collection instead", () => {
    assert.match(billService, /export const listBillHistory/);
    const fn = billService.slice(billService.indexOf("export const listBillHistory"));
    assert.match(fn, /Bill\.find\(query\)/);
  });

  it("covers settled, voided and lapsed bills", () => {
    const fn = billService.slice(billService.indexOf("const HISTORY_STATUSES"));
    for (const status of ["PAID", "CANCELLED", "EXPIRED"]) {
      assert.ok(fn.includes(`BILL_STATUS.${status}`), `history omits ${status} bills`);
    }
  });

  it("excludes PENDING, which is a live bill rather than history", () => {
    const line = billService
      .split("\n")
      .find((l) => l.includes("const HISTORY_STATUSES"));
    assert.ok(!line.includes("PENDING"), "a pending bill would show up as history");
  });

  it("flags rows that already have a ledger entry, so nothing appears twice", () => {
    // A coin-paid bill is BOTH a REDEEM row and a bill. The clients merge the
    // two feeds and use this to drop the duplicate.
    const fn = billService.slice(billService.indexOf("export const listBillHistory"));
    assert.match(fn, /hasLedgerRow: Boolean\(bill\.transactionId\)/);
  });

  it("says who cancelled it", () => {
    // "I declined this" and "the hotel withdrew it" look identical otherwise,
    // and the second reads as the app losing the guest's bill.
    const fn = billService.slice(billService.indexOf("export const listBillHistory"));
    assert.match(fn, /cancelledByRole/);
  });

  it("sorts on when the bill reached its final state, not when it was raised", () => {
    const fn = billService.slice(billService.indexOf("export const listBillHistory"));
    assert.match(fn, /at: bill\.paidAt \|\| bill\.cancelledAt \|\| bill\.createdAt/);
  });
});

describe("history is only merged where it cannot mislead", () => {
  const guestController = read("../src/controllers/guest.controller.js");

  it("skips bills on a filtered or paged coin view", () => {
    // The filters act on coin-ledger fields. Adding bill rows to a filtered
    // view would put rows on screen that the active filter excludes.
    assert.match(guestController, /const wantsBills = !type && Number\(page\) === 1/);
    assert.match(
      hotelController,
      /const wantsBills = !type && !outlet && !minCoins && !from && !to && Number\(page\) === 1/
    );
  });

  it("returns bills alongside the ledger rather than inside items", () => {
    assert.match(guestController, /\.\.\.data, bills: bills\.items/);
    assert.match(hotelController, /\.\.\.data, bills: bills\.items/);
  });
});

describe("bill statuses", () => {
  it("still has exactly one terminal state per outcome", () => {
    assert.deepEqual(
      Object.keys(BILL_STATUS).sort(),
      ["CANCELLED", "EXPIRED", "PAID", "PENDING"]
    );
  });
});
