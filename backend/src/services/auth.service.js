import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from "../utils/token.util.js";
import { User } from "../models/user.model.js";
import { verifyOtp, normalizePhone } from "./otp.service.js";
import { findHotelByQr, joinHotel } from "./membership.service.js";

const MAX_SESSIONS = 5;

/** Issues an access token and records the (hashed) refresh token on the user. */
const issueTokens = async (user) => {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  await User.updateOne(
    { _id: user._id },
    {
      // Cap concurrent sessions; oldest drops off.
      $push: { refreshTokens: { $each: [hashToken(refreshToken)], $slice: -MAX_SESSIONS } },
      $set: { lastLoginAt: new Date() },
    }
  );

  return { accessToken, refreshToken };
};

export const staffLogin = async ({ email, password }) => {
  const user = await User.findOne({ email: String(email).toLowerCase() }).select("+passwordHash");

  // Same message for unknown email and wrong password — no account enumeration.
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, "Incorrect email or password");
  }
  if (!user.isActive) throw new ApiError(403, "This account has been deactivated");
  if (user.role === ROLES.GUEST) {
    throw new ApiError(403, "Guests sign in with their phone number");
  }

  const tokens = await issueTokens(user);
  return { user: user.toSafeObject(), ...tokens };
};

/**
 * Verifies the OTP and signs the guest in, creating the account on first use.
 * If a hotel is supplied (from the QR), the guest is joined to it.
 */
export const guestVerify = async ({ phone: rawPhone, otp, hotelSlug, qrToken, name }) => {
  await verifyOtp(rawPhone, otp);
  const phone = normalizePhone(rawPhone);

  let user = await User.findOne({ phone, role: ROLES.GUEST });
  let isNewUser = false;

  if (!user) {
    user = await User.create({ role: ROLES.GUEST, name: name?.trim() || "Guest", phone });
    isNewUser = true;
  } else if (!user.isActive) {
    throw new ApiError(403, "This account has been deactivated");
  } else if (name?.trim() && user.name === "Guest") {
    user.name = name.trim();
    await user.save();
  }

  let joined = null;
  if (hotelSlug || qrToken) {
    const hotel = await findHotelByQr({ slug: hotelSlug, qrToken });
    const result = await joinHotel({ guestId: user._id, hotel });
    joined = {
      hotel: hotel.toPublicObject(),
      membershipId: result.membership._id,
      welcomeCoins: result.welcomeCoins,
      isNewMember: result.created,
    };
  }

  const tokens = await issueTokens(user);
  return { user: user.toSafeObject(), isNewUser, joined, ...tokens };
};

/** Rotates the refresh token: the presented one is consumed, a new one issued. */
export const refreshSession = async (presentedToken) => {
  if (!presentedToken) throw new ApiError(401, "Session expired, please sign in again");

  const payload = verifyRefreshToken(presentedToken);
  const user = await User.findById(payload.sub).select("+refreshTokens");

  if (!user || !user.isActive) throw new ApiError(401, "Session is no longer valid");

  const presentedHash = hashToken(presentedToken);
  if (!user.refreshTokens.includes(presentedHash)) {
    // Token was already used or revoked (possible replay) — drop all sessions.
    await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });
    throw new ApiError(401, "Session is no longer valid, please sign in again");
  }

  await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: presentedHash } });
  const tokens = await issueTokens(user);

  return { user: user.toSafeObject(), ...tokens };
};

export const logout = async ({ userId, refreshToken }) => {
  if (!userId) return;
  if (refreshToken) {
    await User.updateOne({ _id: userId }, { $pull: { refreshTokens: hashToken(refreshToken) } });
  } else {
    await User.updateOne({ _id: userId }, { $set: { refreshTokens: [] } });
  }
};
