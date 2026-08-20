import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const signAccessToken = (user) =>
  jwt.sign(
    { sub: String(user._id), role: user.role, hotelId: user.hotelId ? String(user.hotelId) : null },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );

/**
 * The `jti` makes every refresh token unique. Without it, two refreshes issued
 * in the same second produce an identical JWT string, so rotation would remove
 * the token it just issued and leave the old one replayable.
 */
export const signRefreshToken = (user) =>
  jwt.sign(
    { sub: String(user._id), jti: crypto.randomUUID() },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );

export const verifyAccessToken = (token) => jwt.verify(token, env.jwt.accessSecret);
export const verifyRefreshToken = (token) => jwt.verify(token, env.jwt.refreshSecret);

/** SHA-256, used so refresh tokens and OTPs are never stored in plaintext. */
export const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

export const generateRawToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

/** Cryptographically random numeric OTP — never Math.random(). */
export const generateOtp = (length = env.otp.length) => {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, "0");
};
