import mongoose from "mongoose";

/**
 * A short-lived OTP challenge. TTL genuinely belongs here — nothing references
 * these rows once the code is verified or abandoned.
 */
const pendingOtpSchema = new mongoose.Schema(
  {
    /**
     * Whatever the guest signs in with: a normalized email address or a bare
     * 10-digit phone number. Storing one field rather than two keeps the
     * uniqueness guarantee ("one live challenge per identifier") intact no
     * matter which channel issued it.
     */
    identifier: { type: String, required: true, trim: true, lowercase: true },
    channel: { type: String, enum: ["email", "phone"], required: true },

    purpose: { type: String, enum: ["GUEST_LOGIN"], default: "GUEST_LOGIN" },

    otpHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },

    // TTL: MongoDB removes the document once this timestamp passes.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

// Re-requesting a code upserts the existing challenge rather than piling up rows.
pendingOtpSchema.index({ identifier: 1, purpose: 1 }, { unique: true });

export const PendingOtp = mongoose.model("PendingOtp", pendingOtpSchema);
