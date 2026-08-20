import { env, otpDevBypass } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { generateOtp, hashToken } from "../utils/token.util.js";
import { PendingOtp } from "../models/pendingOtp.model.js";

/**
 * SMS providers. Swapping `console` for a real gateway is a drop-in here —
 * no caller changes anywhere else in the codebase.
 */
const providers = {
  console: {
    send: async (phone, otp) => {
      logger.info(`[OTP] ${phone} -> ${otp}`);
    },
  },
  // twilio: { send: async (phone, otp) => { ... } },
};

const getProvider = () => providers[env.otp.provider] || providers.console;

/**
 * Reduces any input to the bare 10-digit mobile number, so "+91 98765 43210",
 * "09876543210" and "9876543210" all resolve to the SAME guest account. Without
 * this, one person could end up with several accounts and split balances.
 */
export const normalizePhone = (raw = "") => {
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export const requestOtp = async (rawPhone) => {
  const phone = normalizePhone(rawPhone);
  const otp = generateOtp();

  await PendingOtp.findOneAndUpdate(
    { phone, purpose: "GUEST_LOGIN" },
    {
      phone,
      purpose: "GUEST_LOGIN",
      otpHash: hashToken(otp),
      attempts: 0,
      expiresAt: new Date(Date.now() + env.otp.expiresMinutes * 60_000),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await getProvider().send(phone, otp);

  // Only surfaced outside production, so the flow is testable without SMS.
  return { phone, devOtp: otpDevBypass ? otp : undefined };
};

export const verifyOtp = async (rawPhone, otp) => {
  const phone = normalizePhone(rawPhone);

  const pending = await PendingOtp.findOne({ phone, purpose: "GUEST_LOGIN" }).select("+otpHash");

  // A challenge must exist even in bypass mode, so the real request -> verify
  // sequence is genuinely exercised in development.
  if (!pending) throw new ApiError(400, "Please request a new code");

  if (pending.expiresAt <= new Date()) {
    await PendingOtp.deleteOne({ _id: pending._id });
    throw new ApiError(400, "This code has expired, please request a new one");
  }

  // ---- The only bypass. Forced false when NODE_ENV=production (see env.js). ----
  if (!otpDevBypass) {
    if (pending.attempts >= env.otp.maxAttempts) {
      await PendingOtp.deleteOne({ _id: pending._id });
      throw new ApiError(429, "Too many incorrect attempts, please request a new code");
    }

    if (pending.otpHash !== hashToken(String(otp))) {
      await PendingOtp.updateOne({ _id: pending._id }, { $inc: { attempts: 1 } });
      throw new ApiError(400, "That code is not correct");
    }
  }

  await PendingOtp.deleteOne({ _id: pending._id });
  return { phone };
};
