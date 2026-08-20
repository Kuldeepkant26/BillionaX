import mongoose from "mongoose";
import { TX_TYPE_VALUES } from "../config/constants.js";

/**
 * The coin ledger. APPEND-ONLY: rows are never updated or deleted.
 *
 * `coins` is signed (+credit / -debit) and `balanceAfter` snapshots the
 * membership balance right after the row, which makes
 * `sum(coins) === membership.balance` a cheap integrity check.
 */
const coinTransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TX_TYPE_VALUES, required: true, index: true },

    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHotelMembership",
      index: true,
    },

    coins: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },

    // EARN / STAY context. For STAY, roomAmount is the total stay amount the
    // manager entered and ratePercent is the tier rate it was credited at.
    roomAmount: { type: Number },
    nights: { type: Number },
    ratePercent: { type: Number },
    // Tier held when the stay was recorded — the one that set ratePercent.
    // Kept so a later threshold change cannot make an old row look mispriced.
    tierAtEarn: { type: String },

    // REDEEM context
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "Voucher" },
    billAmount: { type: Number },
    cashPayable: { type: Number },
    outlet: { type: String, trim: true },
    platformFee: { type: Number },

    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    idempotencyKey: { type: String },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true }
);

coinTransactionSchema.index({ hotelId: 1, createdAt: -1 });
coinTransactionSchema.index({ guestId: 1, createdAt: -1 });
coinTransactionSchema.index({ membershipId: 1, createdAt: -1 });

// Blocks double-submit on redeem.
coinTransactionSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export const CoinTransaction = mongoose.model("CoinTransaction", coinTransactionSchema);
