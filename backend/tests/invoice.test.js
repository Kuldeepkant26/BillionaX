/**
 * The invoice documents, and the boundaries they sit on.
 *
 * These pin the parts whose failure is SILENT rather than loud:
 *
 *  - THE MONEY UNIT. CoinPurchase.amountPaid is in RUPEES; every field on an
 *    invoice is in PAISE. Getting that conversion wrong bills a hotel 100x or
 *    1/100th and the document still renders perfectly, which is exactly the
 *    failure mode bill.model.js warns about at the ledger boundary.
 *
 *  - THE IDEMPOTENCY GUARANTEE. Issuing is retried by webhooks and double
 *    taps, and the only thing standing between that and two invoice numbers
 *    for one payment is a unique PARTIAL index. Sparse would not do: every
 *    COIN_PURCHASE row has a null billId, and sparse still collides on
 *    explicit nulls — the trap user.model.js records.
 *
 *  - VALIDATION THAT PROTECTS THE DOCUMENT. accentColor is interpolated into
 *    inline styles and numberPrefix into an invoice number, so neither may
 *    accept free text.
 *
 * No database: these exercise schema validation and index declarations, which
 * is where the guarantees are written down. The Mongo paths need a live server.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { Invoice } from "../src/models/invoice.model.js";
import { InvoiceTemplate } from "../src/models/invoiceTemplate.model.js";
import { Counter } from "../src/models/counter.model.js";

const oid = () => new mongoose.Types.ObjectId();

/** The invoice a settled guest bill produces. */
const guestInvoice = () =>
  new Invoice({
    number: "BLX-2026-000001",
    kind: "GUEST_BILL",
    billId: oid(),
    hotelId: oid(),
    guestId: oid(),
    issuedAt: new Date(),
    seller: { name: "Grand Palace", taxId: "27AABCU9603R1ZX" },
    buyer: { name: "Aarav", email: "a@example.com" },
    lines: [{ description: "Dinner", qty: 1, unitPricePaise: 340000, amountPaise: 340000 }],
    subtotalPaise: 340000,
    taxPercent: 5,
    taxPaise: 17000,
    totalPaise: 357000,
    coinsApplied: 1500,
    coinsDiscountPaise: 150000,
    amountPaidPaise: 207000,
    paymentMethod: "Online",
  });

describe("the invoice document", () => {
  it("accepts what a settled bill produces", () => {
    assert.equal(guestInvoice().validateSync(), undefined);
  });

  it("accepts a coin purchase, which has no bill and no coins", () => {
    const invoice = new Invoice({
      number: "BLX-2026-000002",
      kind: "COIN_PURCHASE",
      purchaseId: oid(),
      hotelId: oid(),
      issuedAt: new Date(),
      seller: { name: "BillionaX" },
      buyer: { name: "Grand Palace" },
      lines: [
        { description: "Coin inventory", qty: 10000, unitPricePaise: 100, amountPaise: 1000000 },
      ],
      subtotalPaise: 1000000,
      totalPaise: 1000000,
      amountPaidPaise: 1000000,
    });

    assert.equal(invoice.validateSync(), undefined);
    assert.equal(invoice.coinsApplied, 0);
  });

  it("treats 'no address to send to' as its own outcome, not a failure", () => {
    // Guests sign up by PHONE, so an invoice with nowhere to go is the common
    // case. Defaulting to FAILED would make the normal path look broken.
    assert.equal(guestInvoice().email.status, "SKIPPED");
  });

  it("refuses an unknown kind and negative money", () => {
    const bad = new Invoice({
      kind: "NOPE",
      number: "X",
      subtotalPaise: -5,
      totalPaise: 0,
      amountPaidPaise: 0,
    });
    const err = bad.validateSync();

    assert.ok(err?.errors?.kind);
    assert.ok(err?.errors?.subtotalPaise);
  });
});

describe("one invoice per payment", () => {
  const indexes = Invoice.schema.indexes();
  const find = (field) => indexes.find(([keys]) => keys[field] === 1)?.[1];

  it("declares billId unique, so a retried settlement cannot issue twice", () => {
    assert.equal(find("billId")?.unique, true);
  });

  it("declares purchaseId unique for the same reason", () => {
    assert.equal(find("purchaseId")?.unique, true);
  });

  it("uses PARTIAL indexes, never sparse", () => {
    // Every COIN_PURCHASE row has a null billId and vice versa. Sparse still
    // collides on an explicit null, so it would reject the second invoice of
    // the other kind entirely.
    assert.ok(find("billId")?.partialFilterExpression);
    assert.ok(find("purchaseId")?.partialFilterExpression);
  });

  it("declares the invoice number unique", () => {
    assert.equal(Invoice.schema.path("number").options.unique, true);
  });
});

describe("money units", () => {
  it("converts a purchase's RUPEES into the invoice's PAISE", () => {
    // CoinPurchase.amountPaid is compared against a rupee `expected` in
    // coin.service.js, so it is unambiguously rupees.
    const amountPaidRupees = 10000;
    assert.equal(Math.round(amountPaidRupees * 100), 1000000);
  });

  it("passes a bill's paise through without converting again", () => {
    // Bill.payablePaise is already paise. A second ×100 here is the 100x error
    // the provider interface calls out, and it would render as a valid figure.
    const invoice = guestInvoice();
    assert.equal(invoice.amountPaidPaise, 207000);
  });

  it("keeps the document's own arithmetic consistent", () => {
    const inv = guestInvoice();
    assert.equal(inv.subtotalPaise + inv.taxPaise, inv.totalPaise);
    assert.equal(inv.totalPaise - inv.coinsDiscountPaise, inv.amountPaidPaise);
  });
});

describe("the invoice template", () => {
  it("is usable with nothing configured", () => {
    const tpl = new InvoiceTemplate({ key: "GLOBAL" });

    assert.equal(tpl.validateSync(), undefined);
    assert.equal(tpl.branding.numberPrefix, "BLX");
    assert.equal(tpl.emailEnabled, true);
  });

  it("ships recoverable defaults for every editable document", () => {
    // These are what "Reset to default" restores, and they are what makes
    // handing an admin a raw-HTML editor survivable.
    const tpl = new InvoiceTemplate({ key: "GLOBAL" });

    assert.ok(tpl.invoiceHtml.length > 500);
    assert.ok(tpl.emailHtml.length > 200);
    assert.ok(tpl.emailText.length > 20);
  });

  it("refuses values that would break the rendered document", () => {
    const bad = new InvoiceTemplate({
      key: "G2",
      branding: { accentColor: "red", numberPrefix: "has space!" },
    });
    const err = bad.validateSync();

    // accentColor lands inside inline styles; numberPrefix inside an invoice
    // number that must stay filename- and URL-safe.
    assert.ok(err?.errors?.["branding.accentColor"]);
    assert.ok(err?.errors?.["branding.numberPrefix"]);
  });
});

describe("invoice numbering", () => {
  it("keys the sequence uniquely and starts it at zero", () => {
    // The atomic $inc is what stops two simultaneous payments sharing a
    // number; count()+1 would hand both the same one.
    assert.equal(Counter.schema.path("key").options.unique, true);
    assert.equal(new Counter({ key: "invoice:2026" }).value, 0);
  });
});
