import { env, otpDevBypass, isSmsConfigured, isEmailConfigured } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { ApiError } from "../utils/ApiError.js";
import { generateOtp, hashToken } from "../utils/token.util.js";
import { PendingOtp } from "../models/pendingOtp.model.js";
import { sendSms } from "./sms.service.js";
import { sendEmail, normalizeEmail } from "./email.service.js";
import { otpEmailTemplate } from "./emailTemplates.js";

/** The channel guests sign in with, unless a request overrides it. */
export const defaultChannel = () => env.otp.channel;

/**
 * Reduces any input to the bare 10-digit mobile number, so "+91 98765 43210",
 * "09876543210" and "9876543210" all resolve to the SAME guest account. Without
 * this, one person could end up with several accounts and split balances.
 */
export const normalizePhone = (raw = "") => {
  const digits = String(raw).replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** The same idea as normalizePhone, for the email channel. */
export const normalizeIdentifier = (raw, channel) =>
  channel === "email" ? normalizeEmail(raw) : normalizePhone(raw);

/** What the guest actually reads. */
const smsMessage = (otp) =>
  `${otp} is your BillionaX verification code. It expires in ${env.otp.expiresMinutes} minutes. Do not share it with anyone.`;

/**
 * Delivery channels. Each takes the normalized identifier and the code.
 * Swapping a gateway is a drop-in here — no caller changes anywhere else.
 */
const channels = {
  phone: {
    configured: () => isSmsConfigured,
    send: async (phone, otp) => {
      if (env.otp.provider === "console") return logger.info(`[OTP] ${phone} -> ${otp}`);
      await sendSms(phone, smsMessage(otp));
    },
  },
  email: {
    configured: () => isEmailConfigured,
    send: async (email, otp) => {
      await sendEmail({
        to: email,
        subject: `${otp} is your BillionaX verification code`,
        ...otpEmailTemplate(otp, env.otp.expiresMinutes),
      });
    },
  },
};

/**
 * Falls back to logging the code when the selected channel has no credentials,
 * so a developer without keys still gets a working login instead of a 500.
 * Production cannot reach this path — validateEnv refuses to boot without them.
 */
const logToConsole = async (identifier, otp) => logger.info(`[OTP] ${identifier} -> ${otp}`);

const getSender = (channel) => {
  const target = channels[channel];
  if (!target) throw new ApiError(400, "Unsupported verification channel");

  if (!target.configured()) {
    logger.warn(`[OTP] ${channel} channel is not configured — logging the code instead`);
    return logToConsole;
  }

  return target.send;
};

export const requestOtp = async (rawIdentifier, channel = defaultChannel()) => {
  const identifier = normalizeIdentifier(rawIdentifier, channel);
  const otp = generateOtp();

  await PendingOtp.findOneAndUpdate(
    { identifier, purpose: "GUEST_LOGIN" },
    {
      identifier,
      channel,
      purpose: "GUEST_LOGIN",
      otpHash: hashToken(otp),
      attempts: 0,
      expiresAt: new Date(Date.now() + env.otp.expiresMinutes * 60_000),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  try {
    await getSender(channel)(identifier, otp);
  } catch (err) {
    // The challenge is written before the send, so a gateway failure would
    // otherwise leave a code nobody received sitting in the DB — blocking the
    // "please request a new code" path until it expires. Drop it.
    await PendingOtp.deleteOne({ identifier, purpose: "GUEST_LOGIN" });

    // The gateway's own message can carry account and billing detail, so it
    // goes to the log, never to the guest.
    logger.error(`[OTP] delivery failed for ${identifier}: ${err.message}`);
    throw new ApiError(502, "We could not send your code right now, please try again");
  }

  // Only surfaced outside production, so the flow is testable without a gateway.
  return { identifier, channel, devOtp: otpDevBypass ? otp : undefined };
};

export const verifyOtp = async (rawIdentifier, otp, channel = defaultChannel()) => {
  const identifier = normalizeIdentifier(rawIdentifier, channel);

  const pending = await PendingOtp.findOne({ identifier, purpose: "GUEST_LOGIN" }).select(
    "+otpHash"
  );

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
  return { identifier, channel: pending.channel };
};
