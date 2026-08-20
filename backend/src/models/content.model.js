import mongoose from "mongoose";
import { CONTENT_KIND_VALUES, TIER_VALUES } from "../config/constants.js";

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

    // OFFER only
    validFrom: { type: Date },
    validTo: { type: Date },

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

    // PRIVILEGE only — which tiers see this. Absent or empty means every tier.
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

export const Content = mongoose.model("Content", contentSchema);
