import rateLimit from "express-rate-limit";
import { isProduction } from "../config/env.js";

const build = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max: isProduction ? max : max * 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { statusCode: 429, success: false, message },
  });

/** Login/refresh endpoints — blunts credential stuffing. */
export const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many attempts, please try again later",
});

/** OTP requests — SMS costs money and the endpoint is unauthenticated. */
export const otpLimiter = build({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: "Too many code requests, please wait a few minutes",
});

/**
 * Voucher verify/redeem. Codes are short, so without this the code space is
 * brute-forceable by a malicious staff account.
 */
export const redeemLimiter = build({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many verification attempts, please slow down",
});

/**
 * Feed image signatures.
 *
 * Unlike an avatar or a logo this endpoint is called in a LOOP — once per image,
 * so ten times for one carousel — which makes it the one authenticated endpoint
 * a single account can hammer to burn the Cloudinary quota unattended. The cap
 * is generous enough for real posting and finite enough to bound that.
 */
export const feedUploadLimiter = build({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: "Too many uploads, please wait a few minutes",
});
