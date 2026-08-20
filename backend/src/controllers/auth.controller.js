import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { env, isProduction } from "../config/env.js";
import * as authService from "../services/auth.service.js";
import { requestOtp } from "../services/otp.service.js";

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

export const guestRequestOtp = asyncHandler(async (req, res) => {
  const result = await requestOtp(req.body.phone);
  res.status(200).json(new ApiResponse(200, result, "Verification code sent"));
});

export const guestVerifyOtp = asyncHandler(async (req, res) => {
  const { phone, otp, hotelSlug, qrToken, name } = req.body;
  const { refreshToken, ...data } = await authService.guestVerify({
    phone,
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

export const me = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, { user: req.user.toSafeObject() }));
});
