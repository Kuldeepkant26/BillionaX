import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { Hotel } from "../models/hotel.model.js";
import { Content } from "../models/content.model.js";
import { CONTENT_KINDS } from "../config/constants.js";

const router = Router();

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
