import mongoose from "mongoose";
import {
  TIERS,
  CARD_DESIGN_VALUES,
  DEFAULT_CARD_DESIGN,
  THEME_PRESET_VALUES,
  DEFAULT_THEME_PRESET,
  FONT_PRESET_VALUES,
  DEFAULT_FONT_PRESET,
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

    /**
     * Whether the social feed is part of the product right now.
     *
     * Off by default: the feature is built and tested, but the network is
     * launching without it, and a default of true would light it up on every
     * deployment that has never opened the settings page.
     *
     * This gates the NAVIGATION, not the data or the API. Feed routes keep
     * working while it is off, so existing posts, likes and saves survive
     * being switched off and come back untouched — and a guest holding a
     * direct link to a post still sees it rather than a 404. Hiding the door
     * is the reversible half of this; deleting the room is not.
     */
    feedEnabled: { type: Boolean, default: false },

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

    // Which typeface pairing every surface uses. Network-wide for the same
    // reason as themePreset: type is part of the brand, so one choice sets the
    // panels and the guest app together.
    fontPreset: {
      type: String,
      enum: FONT_PRESET_VALUES,
      default: DEFAULT_FONT_PRESET,
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

    /**
     * Razorpay credentials, entered in the admin panel.
     *
     * The secrets are stored ENCRYPTED (see utils/crypto.util.js) and are never
     * returned to the browser — the panel shows a masked value and a Replace
     * action. Environment variables take precedence over these: a
     * deployment-level key must not be overridable from a web form.
     *
     * The presence of a usable key pair is what selects the live payment
     * provider. There is no "demo mode" boolean, deliberately — a flag can
     * disagree with the credentials, and then nobody can say which is true.
     */
    razorpay: {
      keyId: { type: String, trim: true, default: null },
      keySecretEncrypted: { type: String, default: null },
      webhookSecretEncrypted: { type: String, default: null },
      routeEnabled: { type: Boolean, default: false },
      // Set when the key pair last passed a live call against Razorpay.
      verifiedAt: { type: Date, default: null },
    },

    /** Hours a Route transfer is held before release, covering refunds. */
    transferHoldHours: { type: Number, default: 48, min: 0, max: 720 },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const PlatformSettings = mongoose.model("PlatformSettings", platformSettingsSchema);
