import mongoose from "mongoose";
import {
  TIERS,
  CARD_DESIGN_VALUES,
  DEFAULT_CARD_DESIGN,
  THEME_PRESET_VALUES,
  DEFAULT_THEME_PRESET,
} from "../config/constants.js";

/** Platform-wide configuration. Singleton, enforced by the unique `key`. */
const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "GLOBAL", unique: true },

    coinValuePaise: { type: Number, default: 100 }, // 1 coin = ₹1
    defaultEarnRatePercent: { type: Number, default: 15 },
    earnCoinsPer100: { type: Number, default: 20 }, // modelled, not wired this phase
    welcomeCredit: { type: Number, default: 5000 },
    platformFeePercent: { type: Number, default: 5 },

    /**
     * Share of the coins guests redeemed at a hotel that is credited back to
     * that hotel's inventory at month end. Configurable so the commercial deal
     * can change without a deploy; each settlement copies the rate it ran at,
     * so changing this never rewrites history.
     */
    redemptionRebatePercent: { type: Number, default: 50, min: 0, max: 100 },
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

    // Which membership-card art every guest sees. Network-wide by design:
    // the card is the product's face, so it stays consistent across hotels
    // rather than becoming a per-property choice.
    cardDesign: {
      type: String,
      enum: CARD_DESIGN_VALUES,
      default: DEFAULT_CARD_DESIGN,
    },

    // Which colour theme every dashboard uses. Network-wide like cardDesign:
    // the accent is part of the brand, so one choice paints the admin panel,
    // the hotel panels and the guest app alike.
    themePreset: {
      type: String,
      enum: THEME_PRESET_VALUES,
      default: DEFAULT_THEME_PRESET,
    },

    // The hue behind themePreset: "CUSTOM". Stored as a plain hex string and
    // pattern-validated, because this value ends up inside a CSS custom
    // property in every client — anything that is not a colour is rejected
    // here rather than trusted downstream.
    themeCustomColor: {
      type: String,
      default: "#5b6474",
      match: [/^#[0-9a-fA-F]{6}$/, "Enter a 6-digit hex colour"],
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model("PlatformSettings", platformSettingsSchema);
