import mongoose from "mongoose";
import { CONTENT_KINDS, CONTENT_KIND_VALUES, TIER_VALUES } from "../config/constants.js";

/** Rejects javascript: and data: URLs, which would be an XSS vector in <img src>. */
const isSafeUrl = (value) => {
  if (!value) return true;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

const contentSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    kind: { type: String, enum: CONTENT_KIND_VALUES, required: true, index: true },

    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 2000 },
    imageUrl: {
      type: String,
      trim: true,
      validate: { validator: isSafeUrl, message: "Image URL must be an http(s) link" },
    },

    outlet: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    // OFFER only.
    //
    // validTo is a deadline with teeth: the guest query hides the offer the
    // moment it passes, and the expiry sweep deletes the row and its image
    // OFFER_GRACE_DAYS later. A row with no validTo never expires and is
    // never swept.
    validFrom: { type: Date },
    validTo: { type: Date },

    // The headline deal, free text rather than a number: hotels express deals
    // in shapes a number cannot hold ("2 for 1", "₹500 off", "30% off"), and
    // it is display-only. 24 characters is what fits at display size in the
    // fallback card art without shrinking.
    discountLabel: { type: String, trim: true, maxlength: 24 },
    // Fine print, shown collapsed on the detail screen.
    terms: { type: String, trim: true, maxlength: 1000 },
    // One actionable line: "Show this screen at the host desk."
    howToRedeem: { type: String, trim: true, maxlength: 300 },

    // PRIVILEGE only — the short value shown beside the title on the guest's
    // home screen ("Included", "Till 8pm", "20% off").
    valueLabel: { type: String, trim: true, maxlength: 40 },

    // CONTENT / OFFER — an optional video. Only the presence of videoUrl makes
    // a card render as playable; `duration` is the label on the badge ("1:20")
    // and is free text because it is display-only, never used for seeking.
    //
    // Uploads are not wired yet: these are links today, and become Cloudinary
    // URLs later without the shape changing.
    videoUrl: {
      type: String,
      trim: true,
      validate: { validator: isSafeUrl, message: "Video URL must be an http(s) link" },
    },
    duration: { type: String, trim: true, maxlength: 12 },

    // PRIVILEGE and OFFER — which tiers see this. Absent or empty means every
    // tier.
    //
    // `default: undefined` is load-bearing: Mongoose otherwise stamps [] onto
    // EVERY document on save, so existing CONTENT and OFFER rows would quietly
    // grow a field they have no use for the next time an admin edited them.
    tiers: {
      type: [{ type: String, enum: TIER_VALUES }],
      default: undefined,
    },
  },
  { timestamps: true }
);

contentSchema.index({ hotelId: 1, kind: 1, isActive: 1, sortOrder: 1 });

// The expiry sweep's only query. Partial so it indexes offers with a deadline
// and nothing else — slideshow photos, videos and privileges never have one.
// `$type: "date"` rather than `$exists` keeps rows whose validTo is null out
// of the index entirely, which is what makes "no deadline" mean "never swept".
contentSchema.index(
  { validTo: 1 },
  { partialFilterExpression: { kind: CONTENT_KINDS.OFFER, validTo: { $type: "date" } } }
);

export const Content = mongoose.model("Content", contentSchema);
