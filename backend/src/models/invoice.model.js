import mongoose from "mongoose";
import {
  INVOICE_KINDS,
  INVOICE_KIND_VALUES,
  INVOICE_EMAIL_STATUS,
  INVOICE_EMAIL_STATUS_VALUES,
} from "../config/constants.js";

/**
 * A financial document issued when money has actually moved.
 *
 * WHY THIS IS A COLLECTION AND NOT A FIELD ON Bill. An invoice must render
 * exactly as it was issued, forever. Bill already stores its own figures
 * frozen — see the receipt reasoning on lineItem.amountPaise — but the
 * SURROUNDING document is not on the bill: the legal entity name, the GSTIN,
 * the address, the logo and the invoice number all come from a template the
 * main admin can edit. Deriving the invoice from the bill at read time would
 * mean an admin fixing a typo in the company address silently rewrites every
 * invoice ever issued, including ones already emailed and filed by somebody's
 * accountant. So the issuer's details are COPIED here at issue time, the same
 * freezing contract platformFeePercent and RebateSettlement's rate follow.
 *
 * NOTHING HERE IS EVER UPDATED after issue except `email`, which records a
 * delivery attempt and is not part of the document. There is no edit path and
 * no delete path: a wrong invoice is cancelled by issuing a credit note, which
 * this phase does not have, rather than by rewriting history.
 *
 * MONEY IS PAISE, integers, matching bill.model.js. The coin ledger's rupees
 * never reach this file.
 */

/** One row of a rendered invoice. Both kinds flatten down to these. */
const invoiceLineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    qty: { type: Number, required: true, min: 0 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    amountPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

/**
 * A party on the invoice — who is billing, and who is billed.
 *
 * Free-form strings rather than refs, deliberately: a hotel that renames
 * itself or a guest who corrects their name must not change what an issued
 * invoice says. The refs live on the parent document for querying; these are
 * for rendering.
 */
const invoicePartySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 200 },
    address: { type: String, trim: true, maxlength: 500 },
    email: { type: String, trim: true, maxlength: 200 },
    phone: { type: String, trim: true, maxlength: 40 },
    taxId: { type: String, trim: true, maxlength: 60 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    /**
     * The human-facing number, e.g. BLX-2026-000412.
     *
     * Unique and never reused. Generated from an atomic counter — see
     * invoiceNumber.service.js — because two guests paying in the same
     * millisecond must not be handed the same number.
     */
    number: { type: String, required: true, unique: true, trim: true },

    kind: { type: String, enum: INVOICE_KIND_VALUES, required: true, index: true },

    /**
     * What this invoice is FOR. Exactly one is set, per kind.
     *
     * Unique per kind so a retried settlement cannot issue a second invoice for
     * the same bill — the partial index below is the real guarantee, and
     * issueInvoice's duplicate-key catch is what turns that into an idempotent
     * no-op rather than a failed payment.
     */
    billId: { type: mongoose.Schema.Types.ObjectId, ref: "Bill" },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "CoinPurchase" },

    // For filtering and for scoping a hotel admin's view. Never rendered —
    // the snapshot fields below are what the document shows.
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },

    issuedAt: { type: Date, required: true, default: Date.now },

    /* ---- the document, frozen ---- */

    seller: { type: invoicePartySchema, default: () => ({}) },
    buyer: { type: invoicePartySchema, default: () => ({}) },

    lines: { type: [invoiceLineSchema], default: [] },

    subtotalPaise: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxPaise: { type: Number, default: 0, min: 0 },
    /** Before coins. subtotal + tax. */
    totalPaise: { type: Number, required: true, min: 0 },

    /**
     * Coins the guest put against this bill, and their paise value.
     *
     * A DISCOUNT LINE on the invoice, not a payment: the hotel funds it out of
     * its own inventory, so the document shows it reducing the amount due
     * rather than sitting in a payments section. Always 0 on a COIN_PURCHASE.
     */
    coinsApplied: { type: Number, default: 0, min: 0 },
    coinsDiscountPaise: { type: Number, default: 0, min: 0 },

    /** totalPaise − coinsDiscountPaise. What the payer actually paid. */
    amountPaidPaise: { type: Number, required: true, min: 0 },

    currency: { type: String, default: "INR" },

    /* ---- how it was paid ---- */

    paymentRef: { type: String, trim: true },
    paymentMethod: { type: String, trim: true },

    /**
     * Issued against a demo payment. Carried from the bill for the same reason
     * bill.isDemo exists: revenue reporting excludes these rows. Nothing
     * branches on it, and a demo invoice renders identically.
     */
    isDemo: { type: Boolean, default: false, index: true },

    /**
     * The branding this invoice was issued under, copied from the template.
     *
     * This is the whole reason the invoice is a document rather than a view.
     * See the header note.
     */
    branding: {
      logoUrl: { type: String, trim: true },
      accentColor: { type: String, trim: true },
      footerNote: { type: String, trim: true, maxlength: 1000 },
    },

    /** Delivery attempt. Audit only; nothing reads this to decide anything. */
    email: {
      status: {
        type: String,
        enum: INVOICE_EMAIL_STATUS_VALUES,
        default: INVOICE_EMAIL_STATUS.SKIPPED,
      },
      to: { type: String, trim: true },
      sentAt: { type: Date },
      error: { type: String, trim: true, maxlength: 500 },
    },
  },
  { timestamps: true }
);

/**
 * One invoice per bill, one per purchase.
 *
 * Partial rather than sparse for the reason user.model.js records: `sparse`
 * still collides on an explicit null, and every COIN_PURCHASE invoice has a
 * null billId. `$type: "objectId"` indexes only real values.
 */
invoiceSchema.index(
  { billId: 1 },
  { unique: true, partialFilterExpression: { billId: { $type: "objectId" } } }
);
invoiceSchema.index(
  { purchaseId: 1 },
  { unique: true, partialFilterExpression: { purchaseId: { $type: "objectId" } } }
);

// The hotel panel's Transactions tab, and the admin's when filtered by hotel.
invoiceSchema.index({ hotelId: 1, issuedAt: -1 });
// The admin's unfiltered network-wide list.
invoiceSchema.index({ issuedAt: -1 });

/** What the guest owed after coins came off. Named for the template. */
invoiceSchema.virtual("isGuestBill").get(function isGuestBill() {
  return this.kind === INVOICE_KINDS.GUEST_BILL;
});

export const Invoice = mongoose.model("Invoice", invoiceSchema);
