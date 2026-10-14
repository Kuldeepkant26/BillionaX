/**
 * Coin purchases in the Transactions views.
 *
 * A hotel buying inventory is not a row in the guest coin ledger, so the
 * panels lay purchases over the ledger as a second feed. Three things can go
 * wrong with that, and none of them throws:
 *
 *  - PLACEMENT. The ledger is paged and purchases are not. A purchase has to
 *    land on exactly one page — repeated on every page, missing from all of
 *    them, or parked at the foot of page 1 under rows it is weeks older than
 *    are all "works on my machine" until a hotel has a second page of history.
 *
 *  - WHO SEES IT. /transactions and /invoices are open to front-desk staff;
 *    the Coins screen is not. What the property paid the platform must not
 *    reach staff through the side door of a route they are allowed to call.
 *
 *  - UNITS. CoinPurchase.amountPaid is RUPEES and every invoice field is
 *    PAISE. The row shows rupees beside a ledger that is also rupees.
 *
 * The services run for real here with the Mongoose statics stubbed, so the
 * QUERIES they build are what is asserted — no database.
 */
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { ROLES, PURCHASE_STATUS, INVOICE_KINDS } from "../src/config/constants.js";
import { CoinTransaction } from "../src/models/coinTransaction.model.js";
import { CoinPurchase } from "../src/models/coinPurchase.model.js";
import { Invoice } from "../src/models/invoice.model.js";
import { Bill } from "../src/models/bill.model.js";
import * as coinService from "../src/services/coin.service.js";
import * as reportService from "../src/services/report.service.js";
import * as hotelController from "../src/controllers/hotel.controller.js";
import * as adminController from "../src/controllers/admin.controller.js";

const HOTEL = "64b7f0c2f1a2b3c4d5e6f7a8";
const at = (minute) => new Date(Date.UTC(2026, 9, 1, 0, minute));

/* ------------------------------------------------------------------ *
 * stubs
 * ------------------------------------------------------------------ */

/**
 * A stand-in for a Mongoose query: every builder returns itself, awaiting it
 * yields `rows` cut to whatever skip/limit were applied, and the calls are
 * recorded on `seen` so a test can ask what the service built.
 */
const fakeQuery = (rows, seen = {}) => {
  const q = {
    populate: () => q,
    select: () => q,
    lean: () => q,
    sort: (s) => ((seen.sort = s), q),
    skip: (n) => ((seen.skip = n), q),
    limit: (n) => ((seen.limit = n), q),
    then: (resolve, reject) => {
      // findOne resolves a single document (or null), not a list.
      if (!Array.isArray(rows)) return Promise.resolve(rows).then(resolve, reject);

      const from = seen.skip || 0;
      const to = seen.limit == null ? undefined : from + seen.limit;
      return Promise.resolve(rows.slice(from, to)).then(resolve, reject);
    },
  };
  return q;
};

const real = {};
let ledger = [];
let purchases = [];
let invoices = [];
let calls = {};

before(() => {
  real.txFind = CoinTransaction.find;
  real.txCount = CoinTransaction.countDocuments;
  real.purchaseFind = CoinPurchase.find;
  real.invoiceFind = Invoice.find;
  real.invoiceFindOne = Invoice.findOne;
  real.invoiceCount = Invoice.countDocuments;
  real.billFind = Bill.find;

  CoinTransaction.find = (filter) => {
    calls.tx = { filter };
    return fakeQuery(ledger, calls.tx);
  };
  CoinTransaction.countDocuments = async () => ledger.length;

  CoinPurchase.find = (query) => {
    calls.purchase = { query };
    // Honour the range, so the paging test exercises the real window.
    const r = query.createdAt || {};
    const hit = purchases.filter(
      (p) =>
        (r.$gt == null || p.createdAt > r.$gt) &&
        (r.$gte == null || p.createdAt >= r.$gte) &&
        (r.$lte == null || p.createdAt <= r.$lte)
    );
    return fakeQuery(hit, calls.purchase);
  };

  Invoice.find = (query) => {
    calls.invoiceFind = { query };
    return fakeQuery(invoices, calls.invoiceFind);
  };
  Invoice.findOne = (query) => {
    calls.invoiceFindOne = { query };
    return fakeQuery(null);
  };
  Invoice.countDocuments = async () => 0;

  Bill.find = () => fakeQuery([]);
});

after(() => {
  CoinTransaction.find = real.txFind;
  CoinTransaction.countDocuments = real.txCount;
  CoinPurchase.find = real.purchaseFind;
  Invoice.find = real.invoiceFind;
  Invoice.findOne = real.invoiceFindOne;
  Invoice.countDocuments = real.invoiceCount;
  Bill.find = real.billFind;
});

beforeEach(() => {
  ledger = [];
  purchases = [];
  invoices = [];
  calls = {};
});

/** Runs an asyncHandler-wrapped controller and resolves with what it sent. */
const call = (handler, req) =>
  new Promise((resolve, reject) => {
    const res = {
      status: () => res,
      json: (body) => resolve(body.data),
    };
    handler({ query: {}, params: {}, ...req }, res, reject);
  });

const asRole = (role, extra = {}) => ({ user: { role }, hotelId: HOTEL, ...extra });

/* ------------------------------------------------------------------ *
 * the window
 * ------------------------------------------------------------------ */

describe("purchaseRangeForPage", () => {
  const range = coinService.purchaseRangeForPage;
  const rows = (...minutes) => minutes.map((m) => ({ createdAt: at(m) }));

  it("is unbounded for a ledger that fits on one page", () => {
    assert.deepEqual(range({ page: 1, items: rows(50, 40), nextAt: null }), {});
  });

  it("is unbounded for a hotel with no ledger rows at all", () => {
    // A new hotel's first act is buying coins. That purchase has to show
    // before a single guest transaction exists.
    assert.deepEqual(range({ page: 1, items: [], nextAt: null }), {});
  });

  it("gives page 1 everything newer than the next page's first row", () => {
    assert.deepEqual(range({ page: 1, items: rows(50, 40), nextAt: at(30) }), { $gt: at(30) });
  });

  it("bounds a middle page by its own first row and the next page's", () => {
    assert.deepEqual(range({ page: 2, items: rows(30, 20), nextAt: at(10) }), {
      $lte: at(30),
      $gt: at(10),
    });
  });

  it("gives the last page everything older", () => {
    assert.deepEqual(range({ page: 3, items: rows(10, 5), nextAt: null }), { $lte: at(10) });
  });

  it("carries nothing on a page past the end", () => {
    assert.equal(range({ page: 9, items: [], nextAt: null }), null);
  });

  it("applies the date filter only on the open ends", () => {
    // Open at both ends: the filter is the whole window.
    assert.deepEqual(range({ page: 1, items: [], nextAt: null, from: at(5), to: at(55) }), {
      $lte: at(55),
      $gte: at(5),
    });
    // Closed below by the next page, so only `to` binds.
    assert.deepEqual(
      range({ page: 1, items: rows(50), nextAt: at(30), from: at(5), to: at(55) }),
      { $lte: at(55), $gt: at(30) }
    );
    // Closed above by this page's first row, so only `from` binds.
    assert.deepEqual(
      range({ page: 2, items: rows(30), nextAt: null, from: at(5), to: at(55) }),
      { $lte: at(30), $gte: at(5) }
    );
  });

  it("puts every purchase on exactly one page, in its place in time", async () => {
    // Ledger rows at minutes 100, 98, … 2 (50 rows, newest first), five to a
    // page. Purchases newer than all of it, older than all of it, between two
    // rows of one page, in the gap between two pages, and stamped EXACTLY on
    // rows — including a row that starts a page, which is the boundary.
    ledger = Array.from({ length: 50 }, (_, i) => ({ _id: `t${i}`, createdAt: at(100 - i * 2) }));
    const stamps = [120, 101, 100, 99, 97, 92, 91, 90, 89, 51, 50, 3, 2, 1, 0];
    purchases = stamps.map((m) => ({ _id: `p${m}`, coins: 1, amountPaid: 1, createdAt: at(m) }));

    const limit = 5;
    const pages = Math.ceil(ledger.length / limit);
    const placed = new Map();

    for (let page = 1; page <= pages; page += 1) {
      const { items, nextAt } = await reportService.listTransactions({ page, limit, peekNext: true });
      const found = await coinService.purchasesForLedgerPage({ page, items, nextAt });

      for (const p of found) {
        assert.ok(!placed.has(p.id), `${p.id} is on page ${placed.get(p.id)} and page ${page}`);
        placed.set(p.id, page);

        // In its place: not newer than the page before, not older than the
        // page after.
        if (page > 1) assert.ok(p.at <= items[0].createdAt, `${p.id} is newer than page ${page}`);
        if (nextAt) assert.ok(p.at > nextAt, `${p.id} belongs on a later page than ${page}`);
      }
    }

    assert.equal(placed.size, purchases.length, "a purchase is on no page at all");
    assert.equal(placed.get("p120"), 1, "newer than the whole ledger goes on top of page 1");
    assert.equal(placed.get("p0"), pages, "older than the whole ledger goes on the last page");
    // Row 90 starts page 2 (rows 100…92 are page 1). A purchase stamped on it
    // goes with it, not with the page above.
    assert.equal(placed.get("p90"), 2);
    assert.equal(placed.get("p91"), 1);
  });
});

/* ------------------------------------------------------------------ *
 * the ledger's peek
 * ------------------------------------------------------------------ */

describe("listTransactions peekNext", () => {
  beforeEach(() => {
    ledger = Array.from({ length: 7 }, (_, i) => ({ _id: `t${i}`, createdAt: at(70 - i * 10) }));
  });

  it("changes nothing unless asked", async () => {
    const data = await reportService.listTransactions({ page: 1, limit: 5 });
    assert.equal(calls.tx.limit, 5);
    assert.equal(data.items.length, 5);
    assert.ok(!("nextAt" in data), "every other caller must get the shape it always has");
  });

  it("reads one row past the page and reports it, without returning it", async () => {
    const data = await reportService.listTransactions({ page: 1, limit: 5, peekNext: true });
    assert.equal(calls.tx.limit, 6);
    assert.equal(data.items.length, 5);
    assert.deepEqual(data.nextAt, at(20));
    assert.equal(data.total, 7);
  });

  it("reports null on the last page", async () => {
    const data = await reportService.listTransactions({ page: 2, limit: 5, peekNext: true });
    assert.equal(data.items.length, 2);
    assert.equal(data.nextAt, null);
  });
});

/* ------------------------------------------------------------------ *
 * the feed
 * ------------------------------------------------------------------ */

describe("listPurchaseHistory", () => {
  beforeEach(() => {
    purchases = [
      { _id: "64b7f0c2f1a2b3c4d5e6f701", coins: 50000, amountPaid: 47500, paymentRef: "SIM-A", createdAt: at(30), hotelId: { _id: HOTEL, name: "Taj" } },
      { _id: "64b7f0c2f1a2b3c4d5e6f702", coins: 1000, amountPaid: 1000, createdAt: at(10), hotelId: { _id: HOTEL, name: "Taj" } },
    ];
    invoices = [
      { _id: "64b7f0c2f1a2b3c4d5e6f7ff", number: "BLX-2026-000007", purchaseId: "64b7f0c2f1a2b3c4d5e6f701" },
    ];
  });

  it("reads only completed purchases, newest first", async () => {
    await coinService.listPurchaseHistory({ hotelId: HOTEL });
    assert.equal(calls.purchase.query.status, PURCHASE_STATUS.COMPLETED);
    assert.deepEqual(calls.purchase.sort, { createdAt: -1 });
  });

  it("scopes to the hotel when there is one, and to nothing when there is not", async () => {
    await coinService.listPurchaseHistory({ hotelId: HOTEL });
    assert.equal(calls.purchase.query.hotelId, HOTEL);

    // The main admin's network-wide view. A `hotelId: undefined` left in the
    // query would be sent as null and match no purchase at all.
    await coinService.listPurchaseHistory({});
    assert.ok(!("hotelId" in calls.purchase.query));
  });

  it("passes the window through as the createdAt range, and omits an empty one", async () => {
    await coinService.listPurchaseHistory({ range: { $gt: at(5), $lte: at(40) } });
    assert.deepEqual(calls.purchase.query.createdAt, { $gt: at(5), $lte: at(40) });

    await coinService.listPurchaseHistory({ range: {} });
    assert.ok(!("createdAt" in calls.purchase.query), "{} as a range matches nothing in Mongo");
  });

  it("is capped, so one page can never carry an unbounded list", async () => {
    await coinService.listPurchaseHistory({});
    assert.ok(calls.purchase.limit > 0 && calls.purchase.limit <= 100);
  });

  it("attaches each purchase's invoice, and null where none was issued", async () => {
    const { items } = await coinService.listPurchaseHistory({ hotelId: HOTEL });

    assert.deepEqual(items[0].invoice, { id: "64b7f0c2f1a2b3c4d5e6f7ff", number: "BLX-2026-000007" });
    assert.equal(items[1].invoice, null);
    // One lookup for the set, keyed on purchaseId.
    assert.deepEqual(calls.invoiceFind.query.purchaseId.$in, purchases.map((p) => p._id));
  });

  it("reports the amount in RUPEES, exactly as stored", async () => {
    const { items } = await coinService.listPurchaseHistory({ hotelId: HOTEL });
    // 47,500 rupees for the 50,000-coin pack. Paise would read 4750000.
    assert.equal(items[0].amountPaid, 47500);
    assert.equal(items[0].coins, 50000);
    assert.deepEqual(items[0].at, at(30));
    assert.equal(items[0].hotelName, "Taj");
    assert.equal(items[1].paymentRef, null);
  });
});

/* ------------------------------------------------------------------ *
 * who sees it — hotel panel
 * ------------------------------------------------------------------ */

describe("hotel /transactions", () => {
  beforeEach(() => {
    ledger = [{ _id: "t1", createdAt: at(20) }];
    purchases = [{ _id: "64b7f0c2f1a2b3c4d5e6f701", coins: 500, amountPaid: 500, createdAt: at(40) }];
  });

  it("gives a manager the hotel's purchases, scoped to that hotel", async () => {
    const data = await call(hotelController.listTransactions, asRole(ROLES.HOTEL_ADMIN));
    assert.equal(data.purchases.length, 1);
    assert.equal(calls.purchase.query.hotelId, HOTEL);
    // And the ledger rows are still exactly the ledger rows.
    assert.equal(data.items.length, 1);
    assert.ok(!("nextAt" in data), "the paging cursor is internal");
  });

  it("gives front-desk staff none, and never even runs the query", async () => {
    const data = await call(hotelController.listTransactions, asRole(ROLES.HOTEL_STAFF));
    assert.deepEqual(data.purchases, []);
    assert.equal(calls.purchase, undefined, "the purchases collection was read for a staff request");
    // No peek either: staff get the ledger query exactly as it was.
    assert.equal(calls.tx.limit, 25);
  });

  it("refuses a role it does not know rather than assuming", async () => {
    const data = await call(hotelController.listTransactions, asRole("SOME_FUTURE_ROLE"));
    assert.deepEqual(data.purchases, []);
    assert.equal(calls.purchase, undefined);
  });

  it("adds no purchases to a view filtered on ledger-only fields", async () => {
    for (const query of [{ type: "REDEEM" }, { outlet: "Spa" }, { minCoins: 100 }]) {
      calls = {};
      const data = await call(hotelController.listTransactions, asRole(ROLES.HOTEL_ADMIN, { query }));
      assert.deepEqual(data.purchases, [], `purchases leaked into ${JSON.stringify(query)}`);
      assert.equal(calls.purchase, undefined);
    }
  });

  it("keeps purchases under a date filter, cut where the ledger is cut", async () => {
    const query = { from: at(0), to: at(59) };
    const data = await call(hotelController.listTransactions, asRole(ROLES.HOTEL_ADMIN, { query }));
    assert.equal(data.purchases.length, 1);
    assert.deepEqual(calls.purchase.query.createdAt, { $lte: at(59), $gte: at(0) });
    assert.deepEqual(calls.tx.filter.createdAt, { $gte: at(0), $lte: at(59) });
  });
});

/* ------------------------------------------------------------------ *
 * who sees it — invoices
 * ------------------------------------------------------------------ */

describe("hotel /invoices", () => {
  const INVOICE = "64b7f0c2f1a2b3c4d5e6f7ff";

  it("lets staff open guest-bill invoices only, by query rather than by 403", async () => {
    await assert.rejects(
      call(hotelController.getInvoice, asRole(ROLES.HOTEL_STAFF, { params: { invoiceId: INVOICE } })),
      (err) => err.statusCode === 404
    );
    // A coin-purchase invoice reads as "not found" — the same answer as an id
    // that was never issued, so its existence is not confirmed either.
    assert.deepEqual(calls.invoiceFindOne.query.kind, { $in: [INVOICE_KINDS.GUEST_BILL] });
    assert.equal(String(calls.invoiceFindOne.query.hotelId), HOTEL);
  });

  it("leaves a manager's lookup unrestricted by kind", async () => {
    await assert.rejects(
      call(hotelController.getInvoice, asRole(ROLES.HOTEL_ADMIN, { params: { invoiceId: INVOICE } })),
      (err) => err.statusCode === 404
    );
    assert.ok(!("kind" in calls.invoiceFindOne.query));
    assert.equal(String(calls.invoiceFindOne.query.hotelId), HOTEL);
  });

  it("lists only guest bills for staff, whatever kind they ask for", async () => {
    await call(hotelController.listInvoices, asRole(ROLES.HOTEL_STAFF));
    assert.deepEqual(calls.invoiceFind.query.kind, { $in: [INVOICE_KINDS.GUEST_BILL] });

    await call(hotelController.listInvoices, asRole(ROLES.HOTEL_STAFF, { query: { kind: "GUEST_BILL" } }));
    assert.deepEqual(calls.invoiceFind.query.kind, { $in: [INVOICE_KINDS.GUEST_BILL] });

    // Asking for the kind they may not see matches nothing — not "all of
    // them", and not a silent switch to guest bills.
    await call(hotelController.listInvoices, asRole(ROLES.HOTEL_STAFF, { query: { kind: "COIN_PURCHASE" } }));
    assert.deepEqual(calls.invoiceFind.query.kind, { $in: [] });
  });

  it("lists every kind for a manager, or the one they filter by", async () => {
    await call(hotelController.listInvoices, asRole(ROLES.HOTEL_ADMIN));
    assert.ok(!("kind" in calls.invoiceFind.query));

    await call(hotelController.listInvoices, asRole(ROLES.HOTEL_ADMIN, { query: { kind: "COIN_PURCHASE" } }));
    assert.equal(calls.invoiceFind.query.kind, "COIN_PURCHASE");
  });
});

/* ------------------------------------------------------------------ *
 * admin panel
 * ------------------------------------------------------------------ */

describe("admin /transactions", () => {
  beforeEach(() => {
    ledger = [{ _id: "t1", createdAt: at(20) }];
    purchases = [{ _id: "64b7f0c2f1a2b3c4d5e6f701", coins: 500, amountPaid: 500, createdAt: at(40) }];
  });

  const admin = (query = {}) => ({ user: { role: ROLES.MAIN_ADMIN }, query });

  it("shows purchases across the whole network when no hotel is chosen", async () => {
    const data = await call(adminController.listTransactions, admin());
    assert.equal(data.purchases.length, 1);
    assert.ok(!("hotelId" in calls.purchase.query));
    assert.ok(!("nextAt" in data));
  });

  it("narrows purchases to the hotel the ledger is filtered to", async () => {
    await call(adminController.listTransactions, admin({ hotelId: HOTEL }));
    assert.equal(calls.purchase.query.hotelId, HOTEL);
    assert.equal(String(calls.tx.filter.hotelId), HOTEL);
  });

  it("adds no purchases to a view filtered on ledger-only fields", async () => {
    for (const query of [{ type: "EARN" }, { outlet: "Bar" }, { minCoins: 5 }, { minBillAmount: 100 }]) {
      calls = {};
      const data = await call(adminController.listTransactions, admin(query));
      assert.deepEqual(data.purchases, [], `purchases leaked into ${JSON.stringify(query)}`);
      assert.equal(calls.purchase, undefined);
    }
  });
});
