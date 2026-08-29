import mongoose from "mongoose";

/**
 * One month's redemption rebate for one hotel.
 *
 * This row is the record of a period having been settled, and the unique index
 * on {hotelId, period} is what makes the whole job safe to re-run: a second
 * attempt at an already-credited month fails the insert rather than paying the
 * hotel twice. That guarantee lives in the database on purpose — a cron that
 * double-fires, two servers racing, or an operator clicking "Run now" twice
 * must all be harmless.
 *
 * `period` is the calendar month as "YYYY-MM", stored as a string because it is
 * the natural key people reason about ("credit August") and it sorts correctly
 * as text.
 */
const rebateSettlementSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },

    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },

    // The exact window aggregated, kept so a row can be re-derived and checked
    // later even if the period-to-dates rule is ever changed.
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    coinsRedeemed: { type: Number, required: true, min: 0 },

    // The rate actually applied, copied from settings at run time. Without
    // this, changing the platform rate would silently rewrite the meaning of
    // every historical settlement.
    ratePercent: { type: Number, required: true, min: 0, max: 100 },

    coinsCredited: { type: Number, required: true, min: 0 },

    // The ledger row this created, so the settlement and the inventory movement
    // can always be reconciled against each other.
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "CoinTransaction" },

    // Null for the scheduled run; set when an admin triggered it by hand.
    runBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// The idempotency guarantee: one settlement per hotel per month, enforced by
// the database rather than by a check-then-write race in application code.
rebateSettlementSchema.index({ hotelId: 1, period: 1 }, { unique: true });
rebateSettlementSchema.index({ period: -1 });

export const RebateSettlement = mongoose.model("RebateSettlement", rebateSettlementSchema);
