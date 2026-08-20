import mongoose from "mongoose";
import { VOUCHER_STATUS, VOUCHER_STATUS_VALUES } from "../config/constants.js";

/**
 * A one-time redemption code with a short lifetime.
 *
 * NOTE: deliberately NO TTL index on `expiresAt`. A TTL would delete the audit
 * trail that links a CoinTransaction back to its code, and TTL's ~60s sweep
 * makes it unsafe as an expiry *control* anyway. Expiry is enforced as a query
 * predicate at redeem time: { status: ACTIVE, expiresAt: { $gt: now } }.
 */
const voucherSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },

    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GuestHotelMembership",
      required: true,
    },

    coinsRequested: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: VOUCHER_STATUS_VALUES,
      default: VOUCHER_STATUS.ACTIVE,
      index: true,
    },

    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date },
    redeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: "CoinTransaction" },
  },
  { timestamps: true }
);

voucherSchema.index({ hotelId: 1, status: 1 });
voucherSchema.index({ guestId: 1, status: 1 });

voucherSchema.virtual("isUsable").get(function isUsable() {
  return this.status === VOUCHER_STATUS.ACTIVE && this.expiresAt > new Date();
});

export const Voucher = mongoose.model("Voucher", voucherSchema);
