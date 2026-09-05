import mongoose from "mongoose";
import { BILL_STATUS, BILL_STATUS_VALUES, OUTLETS } from "../config/constants.js";

/**
 * A bill hotel staff compose and send to a guest, who pays it from their phone.
 *
 * This replaces the desk-voucher flow, where the guest generated a code, walked
 * it to the desk, and staff typed in a total they read off a separate POS. Here
 * the itemisation lives in the platform, so the guest sees what they are paying
 * for and the hotel gets a record rather than a scalar.
 *
 * MONEY UNITS. Every `*Paise` field is an integer count of paise, because that
 * is what the payment gateway speaks and converting at each call site is where
 * rounding bugs breed. The coin ledger next door is in RUPEES — 1 coin = ₹1,
 * and CoinTransaction.billAmount is a rupee figure the month-end rebate reads
 * as one. bill.service.js is the only place the two units meet.
 *
 * `coinsApplied` is deliberately NOT a paise field: it counts coins, which are
 * a rupee-denominated quantity, and it must stay in the ledger's unit.
 *
 * NO TTL INDEX on expiresAt, for the reason voucher.model.js records: a TTL
 * would delete the audit trail behind a REDEEM ledger row, and its ~60s sweep
 * is far too loose to be an expiry *control*. Expiry is a query predicate —
 * { status: PENDING, expiresAt: { $gt: now } } — enforced when a bill is read
 * and again when it is paid. A separate sweep flips lapsed rows to EXPIRED so
 * the panel stops offering them; it never deletes.
 */

const lineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 120 },
    qty: { type: Number, required: true, min: 1, max: 999 },
    unitPricePaise: { type: Number, required: true, min: 0 },
    /**
     * qty × unitPricePaise, stored rather than derived on read. A paid bill is
     * a receipt: it must still render exactly as the guest saw it, even if the
     * arithmetic here ever changes.
     */
    amountPaise: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHotelMembership",
      required: true,
    },
    // Who sent it. A bill is somebody's action, and a disputed charge needs a
    // name attached to it.
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    outlet: { type: String, trim: true, enum: OUTLETS },

    lineItems: {
      type: [lineItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0 && items.length <= 50,
        message: "A bill needs between 1 and 50 line items",
      },
    },

    /* ---- money: paise, integers ---- */

    subtotalPaise: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0, max: 100 },
    taxPaise: { type: Number, default: 0, min: 0 },
    totalPaise: { type: Number, required: true, min: 0 },

    // Coins the guest chose to put against this bill. RUPEES — a coin count.
    coinsApplied: { type: Number, default: 0, min: 0 },
    // The same fact in paise: coinsApplied × 100.
    coinsDiscountPaise: { type: Number, default: 0, min: 0 },

    // totalPaise − coinsDiscountPaise. What is actually charged.
    payablePaise: { type: Number, required: true, min: 0 },

    /**
     * The split, taken POST-discount: coins come off first and the commission
     * is a share of the cash that actually moves. The hotel funds the coin
     * discount, matching the model where its own inventory backs those coins.
     *
     * hotelAmountPaise is payablePaise − platformCommissionPaise exactly, never
     * a second percentage — see computeBillSplit.
     */
    platformCommissionPaise: { type: Number, default: 0, min: 0 },
    hotelAmountPaise: { type: Number, default: 0, min: 0 },

    /**
     * The rates this bill was priced at, copied in at creation.
     *
     * Frozen for the same reason RebateSettlement freezes its rate: changing a
     * platform fee or a tier cap later must not silently rewrite what a guest
     * already agreed to pay.
     */
    platformFeePercent: { type: Number, required: true, min: 0, max: 100 },
    tierCapPercent: { type: Number, required: true, min: 0, max: 100 },
    tierAtBill: { type: String },

    status: {
      type: String,
      enum: BILL_STATUS_VALUES,
      default: BILL_STATUS.PENDING,
      required: true,
      index: true,
    },

    /* ---- payment provider ---- */

    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },
    razorpayTransferId: { type: String },
    transferStatus: { type: String },

    /**
     * Whether this bill was settled by the demo provider.
     *
     * An AUDIT field only — its single job is letting revenue reports and
     * settlement reconciliation exclude demo rows. No controller, service or
     * component branches on it; a demo bill and a live bill are the same object
     * everywhere else, which is what makes a demo indistinguishable.
     */
    isDemo: { type: Boolean, default: false, index: true },

    /**
     * The REDEEM ledger row written when this bill was paid with coins. Null
     * when no coins were applied, which most bills will be. This is the audit
     * link the voucher used to provide.
     */
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "CoinTransaction" },

    expiresAt: { type: Date, required: true },
    paidAt: { type: Date },
    cancelledAt: { type: Date },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// The staff panel: this hotel's bills, newest first, filtered by status.
billSchema.index({ hotelId: 1, status: 1, createdAt: -1 });

// The guest's Pay screen, and the resync a reconnecting socket performs.
billSchema.index({ guestId: 1, status: 1, createdAt: -1 });

// The expiry sweep's only query.
billSchema.index({ status: 1, expiresAt: 1 });

/** Whether a guest can still act on this bill. Mirrors voucher's isUsable. */
billSchema.virtual("isPayable").get(function isPayable() {
  return this.status === BILL_STATUS.PENDING && this.expiresAt > new Date();
});

export const Bill = mongoose.model("Bill", billSchema);
