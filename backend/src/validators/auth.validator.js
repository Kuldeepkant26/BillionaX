import { body } from "express-validator";
import { env } from "../config/env.js";

export const staffLoginRules = [
  body("email").isEmail().withMessage("Enter a valid email address").normalizeEmail(),
  body("password").isString().isLength({ min: 1 }).withMessage("Password is required"),
];

/**
 * Guests sign in with an email address or a phone number. Which one is decided
 * by `channel`, defaulting to the platform's configured channel, so the rule
 * applied to `identifier` has to be chosen per request rather than up front.
 */
const channelRule = body("channel")
  .optional()
  .isIn(["email", "phone"])
  .withMessage("Unsupported verification channel");

const identifierRule = body("identifier")
  .custom((value, { req }) => {
    const channel = req.body.channel || env.otp.channel;
    const raw = String(value ?? req.body.email ?? req.body.phone ?? "").trim();

    if (!raw) {
      throw new Error(
        channel === "email" ? "Enter your email address" : "Enter your mobile number"
      );
    }

    if (channel === "email") {
      // Deliberately loose: the authoritative check is whether the code
      // actually arrives, and over-strict patterns reject valid addresses.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw)) {
        throw new Error("Enter a valid email address");
      }
      return true;
    }

    const digits = raw.replace(/\D/g, "");
    const local = digits.length > 10 ? digits.slice(-10) : digits;
    if (!/^[6-9]\d{9}$/.test(local)) throw new Error("Enter a valid 10-digit mobile number");
    return true;
  })
  // Mirrors the field the client actually rendered, so the error lands on it.
  .customSanitizer((value, { req }) => value ?? req.body.email ?? req.body.phone);

export const requestOtpRules = [channelRule, identifierRule];

export const verifyOtpRules = [
  channelRule,
  identifierRule,
  body("otp").isString().trim().notEmpty().withMessage("Enter the verification code"),
  body("name").optional().isString().trim().isLength({ max: 80 }),
  body("hotelSlug").optional().isString().trim(),
  body("qrToken").optional().isString().trim(),
];
