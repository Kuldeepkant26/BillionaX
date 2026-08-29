import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { Content } from "../models/content.model.js";
import { CONTENT_KINDS } from "../config/constants.js";
import { offerVisibilityClauses } from "./content.service.js";

/**
 * One offer, for the guest detail screen.
 *
 * The window and the tier gate live in the QUERY, not in the caller. That is
 * the same reasoning getHotelContent already records for privileges: filtering
 * in the UI would still have shipped the row in the payload. A guest who
 * deep-links an expired or off-tier offer gets a 404 — indistinguishable from
 * a wrong id, which is the right answer.
 */
export const getOffer = async ({ contentId, hotelId, tier }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Offer not found");

  const offer = await Content.findOne({
    _id: contentId,
    hotelId,
    kind: CONTENT_KINDS.OFFER,
    isActive: true,
    $and: offerVisibilityClauses(tier),
  }).lean();

  if (!offer) throw new ApiError(404, "Offer not found");

  return { offer };
};
