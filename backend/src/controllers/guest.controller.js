import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { CONTENT_KINDS } from "../config/constants.js";
import * as membershipService from "../services/membership.service.js";
import * as voucherService from "../services/voucher.service.js";
import * as contentService from "../services/content.service.js";
import * as reportService from "../services/report.service.js";
import * as notificationService from "../services/notification.service.js";
import * as uploadService from "../services/upload.service.js";
import { getSettings } from "../services/settings.service.js";

export const listMemberships = asyncHandler(async (req, res) => {
  const [memberships, settings] = await Promise.all([
    membershipService.getMembershipsForGuest(req.user._id),
    getSettings(),
  ]);

  // tierThresholds is the legacy COIN-based ladder. Tier is now earned by
  // nights stayed (resolveTierByNights), so nothing renders this any more —
  // it is kept only so an older app build does not break on a missing key.
  // Drop it once no client reads it.
  res.status(200).json(
    new ApiResponse(200, {
      memberships,
      tierThresholds: settings.tierThresholds,
      // The card art the main admin selected. Sent here because this is the
      // one call the guest app already makes before painting the card, so the
      // design arrives with the data it decorates rather than in a second
      // round trip that would flash the default first.
      cardDesign: settings.cardDesign,
    })
  );
});

export const joinHotel = asyncHandler(async (req, res) => {
  const { hotelSlug, qrToken } = req.body;
  const hotel = await membershipService.findHotelByQr({ slug: hotelSlug, qrToken });
  const result = await membershipService.joinHotel({ guestId: req.user._id, hotel });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        hotel: hotel.toPublicObject(),
        membership: result.membership,
        welcomeCoins: result.welcomeCoins,
        isNewMember: result.created,
      },
      result.created ? `Welcome to ${hotel.name}` : `You are already a member at ${hotel.name}`
    )
  );
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, avatarUrl } = req.body;
  const user = await membershipService.updateGuestProfile({
    guestId: req.user._id,
    name,
    email,
    avatarUrl,
  });
  res.status(200).json(new ApiResponse(200, { user }, "Details updated"));
});

/**
 * Hands the browser a one-shot signature so it can upload straight to
 * Cloudinary. The file never passes through this server.
 *
 * public_id is derived from the guest's own id, so an upload can only ever
 * land on their own avatar — the id is baked into the signature, and a
 * tampered one simply fails Cloudinary's check.
 */
export const createAvatarUpload = asyncHandler(async (req, res) => {
  const data = uploadService.createUploadSignature({
    folder: "avatars",
    publicId: `guest_${req.user._id}`,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const getMembership = asyncHandler(async (req, res) => {
  const membership = await membershipService.getMembershipOrFail({
    guestId: req.user._id,
    hotelId: req.params.hotelId,
  });
  res.status(200).json(new ApiResponse(200, { membership }));
});

export const getMembershipTransactions = asyncHandler(async (req, res) => {
  const { type, page = 1, limit = 25 } = req.query;
  const data = await reportService.listTransactions({
    hotelId: req.params.hotelId,
    guestId: req.user._id,
    type,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

// ---- notifications ----

export const listNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 25 } = req.query;
  const data = await notificationService.listFeed({
    guestId: req.user._id,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const notificationCount = asyncHandler(async (req, res) => {
  const data = await notificationService.unreadCount(req.user._id);
  res.status(200).json(new ApiResponse(200, data));
});

export const markNotificationsRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markAllRead(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Marked as read"));
});

export const createVoucher = asyncHandler(async (req, res) => {
  const { hotelId, coins } = req.body;
  const voucher = await voucherService.issueVoucher({
    guestId: req.user._id,
    hotelId,
    coins: Number(coins),
  });

  res.status(201).json(
    new ApiResponse(
      201,
      {
        id: voucher._id,
        code: voucher.code,
        coinsRequested: voucher.coinsRequested,
        expiresAt: voucher.expiresAt,
      },
      "Show this code at the desk"
    )
  );
});

export const getActiveVoucher = asyncHandler(async (req, res) => {
  const voucher = await voucherService.getActiveVoucher({
    guestId: req.user._id,
    hotelId: req.query.hotelId,
  });
  res.status(200).json(new ApiResponse(200, { voucher }));
});

export const cancelVoucher = asyncHandler(async (req, res) => {
  await voucherService.cancelVoucher({ voucherId: req.params.id, guestId: req.user._id });
  res.status(200).json(new ApiResponse(200, null, "Voucher cancelled"));
});

export const getHotelContent = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;

  // Membership is now required rather than incidental: it is the only record
  // of the guest's tier AT THIS HOTEL, and privileges are tier-gated. The
  // filtering has to happen here, not in the app — hiding a privilege in the
  // UI would still have shipped it in the payload.
  const membership = await membershipService.getMembershipOrFail({
    guestId: req.user._id,
    hotelId,
  });

  const [content, offers, privileges] = await Promise.all([
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.CONTENT,
      activeOnly: true,
    }),
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.OFFER,
      activeOnly: true,
    }),
    // No `currentlyValid`: a privilege is a standing benefit, not a dated
    // promotion, so it has no window to fall outside of.
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.PRIVILEGE,
      activeOnly: true,
      tier: membership.tier,
    }),
  ]);

  res.status(200).json(new ApiResponse(200, { content, offers, privileges }));
});
