/**
 * Coin purchases in the Transactions tables.
 *
 * The server decides WHICH purchases belong on a page (backend
 * tests/purchaseFeed.test.js). What is pinned here is the half that happens in
 * the browser, where every failure is silent:
 *
 *  - the merge — a purchase sorted on the wrong field lands among rows it has
 *    nothing to do with, and a merge that re-sorts a page with nothing to add
 *    is a re-render for free;
 *  - the row — a purchase handed to the LEDGER row's markup renders as
 *    "Guest · undefined · −NaN" rather than throwing, so both tables must
 *    branch on it before they treat a row as a ledger row;
 *  - an older API — a frontend deployed ahead of the backend gets no
 *    `purchases` key at all, and the table has to be exactly what it was.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { mergeFeeds, purchaseRows } from "../src/features/panel/transactionFeed.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, "../src", path), "utf8");

const row = (id, iso) => ({ _id: id, createdAt: iso });

describe("purchaseRows", () => {
  it("wraps a purchase so the table can tell it from a ledger row", () => {
    const purchase = { id: "abc", coins: 50000, amountPaid: 47500, at: "2026-10-13T11:00:00.000Z" };
    assert.deepEqual(purchaseRows([purchase]), [
      { _id: "purchase:abc", createdAt: "2026-10-13T11:00:00.000Z", __purchase: purchase },
    ]);
  });

  it("is empty for a response with no purchases key", () => {
    // An older backend, or a staff login: the key is absent or [].
    assert.deepEqual(purchaseRows(undefined), []);
    assert.deepEqual(purchaseRows(null), []);
    assert.deepEqual(purchaseRows([]), []);
  });
});

describe("mergeFeeds", () => {
  const ledger = [row("t1", "2026-10-13T09:00:00Z"), row("t2", "2026-10-12T15:00:00Z")];

  it("returns the ledger itself when nothing rides along", () => {
    assert.equal(mergeFeeds(ledger), ledger);
    assert.equal(mergeFeeds(ledger, [], []), ledger);
  });

  it("interleaves every feed newest first", () => {
    const bills = [row("bill:1", "2026-10-12T18:00:00Z")];
    const purchases = [row("purchase:new", "2026-10-13T11:00:00Z"), row("purchase:old", "2026-10-09T08:00:00Z")];

    assert.deepEqual(
      mergeFeeds(ledger, bills, purchases).map((r) => r._id),
      ["purchase:new", "t1", "bill:1", "t2", "purchase:old"]
    );
  });

  it("does not disturb the ledger array it was given", () => {
    const before = ledger.map((r) => r._id);
    mergeFeeds(ledger, [row("purchase:x", "2026-10-14T00:00:00Z")]);
    assert.deepEqual(ledger.map((r) => r._id), before);
  });

  it("keeps a ledger row ahead of a purchase stamped at the same instant", () => {
    const tied = mergeFeeds([row("t", "2026-10-13T09:00:00Z")], [row("purchase:p", "2026-10-13T09:00:00Z")]);
    assert.deepEqual(tied.map((r) => r._id), ["t", "purchase:p"]);
  });
});

describe("the two Transactions tables", () => {
  for (const [name, path] of [
    ["hotel", "pages/hotel/TransactionsPage.jsx"],
    ["admin", "pages/admin/AdminTransactionsPage.jsx"],
  ]) {
    const jsx = read(path);

    it(`${name}: merges the purchases the server sent`, () => {
      assert.match(jsx, /from "\.\.\/\.\.\/features\/panel\/transactionFeed\.js"/);
      assert.match(jsx, /purchaseRows\(list\.data\?\.purchases\)/);
      assert.match(jsx, /rows=\{rows\}/, "the table is fed the raw ledger, not the merged rows");
    });

    it(`${name}: branches on a purchase before treating the row as a ledger row`, () => {
      const purchaseAt = jsx.indexOf("if (row.__purchase)");
      const ledgerAt = jsx.indexOf("const t = row;");
      assert.ok(purchaseAt > -1, "no purchase branch");
      assert.ok(ledgerAt > purchaseAt, "a purchase would reach the ledger row's markup");
    });

    it(`${name}: opens the purchase's own invoice, and shows none where there is none`, () => {
      // Not the bill-id map: that is keyed by bill and knows nothing of purchases.
      assert.match(jsx, /purchase\.invoice \? \(/);
      assert.match(jsx, /setInvoiceId\(purchase\.invoice\.id\)/);
    });

    it(`${name}: prints the amount as rupees`, () => {
      // CoinPurchase.amountPaid is rupees. formatPaise here would show a
      // ₹47,500 purchase as ₹475.
      assert.match(jsx, /formatCurrency\(purchase\.amountPaid\)/);
      assert.doesNotMatch(jsx, /formatPaise\(purchase\./);
    });
  }
});
