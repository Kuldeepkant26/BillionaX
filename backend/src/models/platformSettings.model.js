import mongoose from "mongoose";
import { TIERS } from "../config/constants.js";

/** Platform-wide configuration. Singleton, enforced by the unique `key`. */
const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "GLOBAL", unique: true },

    coinValuePaise: { type: Number, default: 100 }, // 1 coin = ₹1
    defaultEarnRatePercent: { type: Number, default: 15 },
    earnCoinsPer100: { type: Number, default: 20 }, // modelled, not wired this phase
    welcomeCredit: { type: Number, default: 5000 },
    platformFeePercent: { type: Number, default: 5 },
    settlementDays: { type: Number, default: 2 },
    voucherTtlMinutes: { type: Number, default: 10 },

    tierCaps: {
      [TIERS.SILVER]: { type: Number, default: 10 },
      [TIERS.GOLD]: { type: Number, default: 20 },
      [TIERS.PLATINUM]: { type: Number, default: 30 },
    },

    // lifetimeEarned needed to reach each tier
    tierThresholds: {
      [TIERS.GOLD]: { type: Number, default: 10000 },
      [TIERS.PLATINUM]: { type: Number, default: 50000 },
    },

    coinsExpire: { type: Boolean, default: false },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model("PlatformSettings", platformSettingsSchema);
