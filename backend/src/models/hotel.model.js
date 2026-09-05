import mongoose from "mongoose";
import { TIERS } from "../config/constants.js";

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

    city: { type: String, trim: true },
    address: { type: String, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    logoUrl: { type: String, trim: true },

    // Opaque QR token, rotatable without changing the public slug.
    qrToken: { type: String, required: true, unique: true, select: false },

    // Authoritative coin inventory. Only ever changed via $inc with a
    // conditional filter — see coin.service.js.
    coinInventory: { type: Number, default: 0, min: 0 },
    totalCoinsPurchased: { type: Number, default: 0 },
    totalCoinsAllocated: { type: Number, default: 0 },
    totalCoinsRedeemed: { type: Number, default: 0 },

    earnRatePercent: { type: Number, default: 15, min: 0, max: 100 },
    tierCaps: {
      [TIERS.SILVER]: { type: Number, default: 10, min: 0, max: 100 },
      [TIERS.GOLD]: { type: Number, default: 20, min: 0, max: 100 },
      [TIERS.PLATINUM]: { type: Number, default: 30, min: 0, max: 100 },
    },

    // Nights a guest must stay at THIS hotel to reach each tier. Silver is the
    // entry tier, so it has no threshold. Each hotel sets its own bar.
    tierNightThresholds: {
      [TIERS.GOLD]: { type: Number, default: 30, min: 1 },
      [TIERS.PLATINUM]: { type: Number, default: 75, min: 1 },
    },

    // Share of the recorded stay amount credited as coins, by the tier the
    // guest held when the stay was recorded.
    tierEarnRates: {
      [TIERS.SILVER]: { type: Number, default: 15, min: 0, max: 100 },
      [TIERS.GOLD]: { type: Number, default: 20, min: 0, max: 100 },
      [TIERS.PLATINUM]: { type: Number, default: 30, min: 0, max: 100 },
    },

    /* ---- KYC and payouts ---- */

    /**
     * What Razorpay Route needs to pay this hotel, plus the KYC behind it.
     *
     * bank holds the values THE BANK RETURNED from the penny drop, never the
     * ones an admin typed. That is the entire point of verifying: a transposed
     * IFSC that reaches this document sends money to the wrong account, and the
     * typed value is exactly the one that would be wrong.
     */
    business: {
      legalName: { type: String, trim: true },
      type: { type: String, trim: true },
      pan: { type: String, trim: true, uppercase: true },
      gstin: { type: String, trim: true, uppercase: true },
      registeredAddress: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },

    stakeholder: {
      name: { type: String, trim: true },
      pan: { type: String, trim: true, uppercase: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
    },

    bank: {
      accountNumber: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
      beneficiaryName: { type: String, trim: true },
      // Straight from the bank, for the name-match check.
      registeredName: { type: String, trim: true },
      bankName: { type: String, trim: true },
      accountStatus: { type: String, trim: true },
      nameMatchScore: { type: Number },
      verifiedAt: { type: Date },
      verificationId: { type: String, trim: true },
    },

    /**
     * Terms acceptance. Timestamp and IP are kept because this is the record
     * that the hotel agreed, and "they clicked it" is worth nothing without
     * when and from where.
     */
    agreement: {
      acceptedAt: { type: Date },
      acceptedIp: { type: String, trim: true },
      acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },

    razorpayLinkedAccountId: { type: String, trim: true, index: true },

    /**
     * Whether this hotel can take money yet.
     *
     * Anything other than "activated" blocks bill creation: a bill a guest
     * cannot pay is worse than no bill, because staff believe it was sent.
     */
    linkedAccountStatus: {
      type: String,
      enum: ["none", "pending", "activated", "needs_clarification", "failed"],
      default: "none",
      index: true,
    },
    linkedAccountNote: { type: String, trim: true },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

hotelSchema.index({ isActive: 1, name: 1 });

hotelSchema.methods.toPublicObject = function toPublicObject() {
  return {
    id: this._id,
    name: this.name,
    slug: this.slug,
    city: this.city,
    logoUrl: this.logoUrl,
  };
};

export const Hotel = mongoose.model("Hotel", hotelSchema);
