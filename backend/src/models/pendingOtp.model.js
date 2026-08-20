import mongoose from "mongoose";

/**
 * A short-lived OTP challenge. TTL genuinely belongs here — nothing references
 * these rows once the code is verified or abandoned.
 */
const pendingOtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true },
    purpose: { type: String, enum: ["GUEST_LOGIN"], default: "GUEST_LOGIN" },

    otpHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },

    // TTL: MongoDB removes the document once this timestamp passes.
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

// Re-requesting a code upserts the existing challenge rather than piling up rows.
pendingOtpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

export const PendingOtp = mongoose.model("PendingOtp", pendingOtpSchema);
