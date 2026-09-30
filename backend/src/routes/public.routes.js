import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Hotel } from "../models/hotel.model.js";
import { Content } from "../models/content.model.js";
import { CONTENT_KINDS } from "../config/constants.js";
import { env } from "../config/env.js";
import { getSettings } from "../services/settings.service.js";

const router = Router();

/**
 * Unauthenticated app config: the theme preset the main admin chose. Public
 * because the login pages must paint in it before anyone has a token, and it
 * leaks nothing — it is a single enum key served from the settings cache.
 */
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.status(200).json(
      new ApiResponse(200, {
        themePreset: settings.themePreset,
        themeCustomColor: settings.themeCustomColor,
        // Same reasoning as the theme: the login page has to paint in the
        // chosen typeface before anyone has a token.
        fontPreset: settings.fontPreset,
        // Whether the feed is switched on. Public for the same reason as the
        // theme: the guest shell reads it to build the bottom nav, and it has
        // to be right on the FIRST paint or the nav visibly reshuffles under
        // the guest's thumb.
        feedEnabled: settings.feedEnabled,
        // So the code input can size itself to the codes actually issued
        // rather than hardcoding a length the server is free to change.
        otpLength: env.otp.length,
        otpChannel: env.otp.channel,
      })
    );
  })
);

/**
 * Unauthenticated hotel lookup for the QR landing screen — the guest needs to
 * see which hotel they scanned before signing in. Returns public fields only.
 */
router.get(
  "/hotels/:slug",
  asyncHandler(async (req, res) => {
    const hotel = await Hotel.findOne({
      slug: String(req.params.slug).toLowerCase(),
      isActive: true,
    });
    if (!hotel) throw new ApiError(404, "Hotel not found");

    const offers = await Content.find({
      hotelId: hotel._id,
      kind: CONTENT_KINDS.OFFER,
      isActive: true,
    })
      .sort({ sortOrder: 1 })
      .limit(6);

    res.status(200).json(new ApiResponse(200, { hotel: hotel.toPublicObject(), offers }));
  })
);

export default router;
