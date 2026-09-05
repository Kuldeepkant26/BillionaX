import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { env, isProduction } from "../config/env.js";
import * as authService from "../services/auth.service.js";
import { requestOtp } from "../services/otp.service.js";
import { Hotel } from "../models/hotel.model.js";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: env.jwt.refreshMaxAgeMs,
};

const setRefreshCookie = (res, token) =>
  res.cookie(env.jwt.refreshCookieName, token, cookieOptions);

export const staffLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { refreshToken, ...data } = await authService.staffLogin({ email, password });

  setRefreshCookie(res, refreshToken);
  res.status(200).json(new ApiResponse(200, data, "Signed in"));
});

/**
 * `identifier` is the email address or phone number being verified. The legacy
 * `phone` body field is still accepted so an older client keeps working.
 */
const identifierFrom = (body) => body.identifier ?? body.email ?? body.phone;

export const guestRequestOtp = asyncHandler(async (req, res) => {
  const result = await requestOtp(identifierFrom(req.body), req.body.channel);
  res.status(200).json(new ApiResponse(200, result, "Verification code sent"));
});

export const guestVerifyOtp = asyncHandler(async (req, res) => {
  const { otp, channel, hotelSlug, qrToken, name } = req.body;
  const { refreshToken, ...data } = await authService.guestVerify({
    identifier: identifierFrom(req.body),
    channel,
    otp,
    hotelSlug,
    qrToken,
    name,
  });

  setRefreshCookie(res, refreshToken);
  res.status(200).json(new ApiResponse(200, data, "Signed in"));
});

export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.[env.jwt.refreshCookieName];
  const { refreshToken, ...data } = await authService.refreshSession(presented);

  setRefreshCookie(res, refreshToken);
  res.status(200).json(new ApiResponse(200, data, "Session refreshed"));
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout({
    userId: req.user?._id,
    refreshToken: req.cookies?.[env.jwt.refreshCookieName],
  });

  res.clearCookie(env.jwt.refreshCookieName, { ...cookieOptions, maxAge: undefined });
  res.status(200).json(new ApiResponse(200, null, "Signed out"));
});

/**
 * The signed-in user, plus the hotel they work at when they are staff.
 *
 * The hotel rides along here rather than in its own request because the panel
 * chrome needs its name and logo on every screen, and this call already runs
 * on every session restore. Two fields on a query the app makes anyway beat a
 * second round trip on every page load.
 *
 * Guests get no hotel: they belong to many, and the one that matters is the
 * active membership, which the memberships call already carries.
 */
export const me = asyncHandler(async (req, res) => {
  const payload = { user: req.user.toSafeObject() };

  if (req.user.hotelId) {
    const hotel = await Hotel.findById(req.user.hotelId).select("name logoUrl").lean();
    if (hotel) {
      payload.hotel = { id: String(hotel._id), name: hotel.name, logoUrl: hotel.logoUrl || null };
    }
  }

  res.status(200).json(new ApiResponse(200, payload));
});
