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
