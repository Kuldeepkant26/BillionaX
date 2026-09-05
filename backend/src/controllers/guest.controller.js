import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { CONTENT_KINDS } from "../config/constants.js";
import * as membershipService from "../services/membership.service.js";
import * as billService from "../services/bill.service.js";
import * as contentService from "../services/content.service.js";
import * as reportService from "../services/report.service.js";
import * as notificationService from "../services/notification.service.js";
import * as uploadService from "../services/upload.service.js";
import * as videoService from "../services/video.service.js";
import * as offerService from "../services/offer.service.js";
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
      // Same reasoning as cardDesign: the admin-chosen colour theme rides
      // along on the bootstrap call so the app never repaints after load.
      themePreset: settings.themePreset,
      themeCustomColor: settings.themeCustomColor,
      fontPreset: settings.fontPreset,
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
  const { name, email, phone, avatarUrl } = req.body;
  const { coinsMoved, ...user } = await membershipService.updateGuestProfile({
    guestId: req.user._id,
    name,
    email,
    phone,
    avatarUrl,
  });

  // Linking a number can pull in coins a hotel awarded before the guest had an
  // account, which is worth saying out loud rather than letting the balance
  // change silently.
  const message = coinsMoved
    ? `Mobile number linked — ${coinsMoved.toLocaleString("en-IN")} coins added to your account`
    : "Details updated";

  res.status(200).json(new ApiResponse(200, { user, coinsMoved }, message));
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

  /**
   * Two feeds, one response: the coin ledger, plus the bills that moved no
   * coins (cancelled, expired, or paid entirely in cash). Those cannot live in
   * the ledger — see listBillHistory — but the guest still expects to see what
   * happened to a bill they were sent, so the client merges them.
   *
   * Sent together rather than as a second request because the History screen
   * needs both to render one list, and two round trips would let it paint a
   * half-complete history first.
   *
   * Only on the unfiltered first page: `type` filters the coin ledger, and
   * bills have no coin type to filter by, so mixing them into a filtered or
   * paged view would put rows on screen the filter says are excluded.
   */
  const wantsBills = !type && Number(page) === 1;

  const [data, bills] = await Promise.all([
    reportService.listTransactions({
      hotelId: req.params.hotelId,
      guestId: req.user._id,
      type,
      page: Number(page),
      limit: Number(limit),
    }),
    wantsBills
      ? billService.listBillHistory({
          hotelId: req.params.hotelId,
          guestId: req.user._id,
          limit: Number(limit),
        })
      : Promise.resolve({ items: [] }),
  ]);

  res.status(200).json(new ApiResponse(200, { ...data, bills: bills.items }));
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

  const [content, offers, privileges, videos] = await Promise.all([
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.CONTENT,
      activeOnly: true,
    }),
    // An offer is dated and can be tier-targeted, so both gates apply. Without
    // `currentlyValid` an expired promotion kept showing indefinitely, and
    // without `tier` a Silver guest could see a Platinum-only deal.
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.OFFER,
      activeOnly: true,
      currentlyValid: true,
      tier: membership.tier,
    }),
    // No `currentlyValid`: a privilege is a standing benefit, not a dated
    // promotion, so it has no window to fall outside of.
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.PRIVILEGE,
      activeOnly: true,
      tier: membership.tier,
    }),
    // Videos are their own kind now, so the home screen's video row no longer
    // has to guess which offers happen to carry a clip.
    contentService.listContent({
      hotelId,
      kind: CONTENT_KINDS.VIDEO,
      activeOnly: true,
    }),
  ]);

  res.status(200).json(new ApiResponse(200, { content, offers, privileges, videos }));
});

/* ---------------------------------------------------------------- videos -- */

/**
 * Every video endpoint re-checks membership rather than trusting the hotelId
 * in the URL. The membership IS the authorisation: without it a guest could
 * read, like and comment on any hotel's videos by guessing an id.
 */
const assertMember = (req) =>
  membershipService.getMembershipOrFail({
    guestId: req.user._id,
    hotelId: req.params.hotelId,
  });

/* ---------------------------------------------------------------- offers -- */

export const getOffer = asyncHandler(async (req, res) => {
  // The membership carries the tier, which is half the visibility gate.
  const membership = await assertMember(req);
  const data = await offerService.getOffer({
    contentId: req.params.contentId,
    hotelId: req.params.hotelId,
    tier: membership.tier,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listVideos = asyncHandler(async (req, res) => {
  await assertMember(req);
  const data = await videoService.listVideos({
    hotelId: req.params.hotelId,
    guestId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const getVideo = asyncHandler(async (req, res) => {
  await assertMember(req);
  const data = await videoService.getVideo({
    contentId: req.params.contentId,
    hotelId: req.params.hotelId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const toggleVideoLike = asyncHandler(async (req, res) => {
  await assertMember(req);
  const data = await videoService.toggleLike({
    contentId: req.params.contentId,
    hotelId: req.params.hotelId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listVideoComments = asyncHandler(async (req, res) => {
  await assertMember(req);
  const data = await videoService.listComments({
    contentId: req.params.contentId,
    hotelId: req.params.hotelId,
    guestId: req.user._id,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listVideoCommentReplies = asyncHandler(async (req, res) => {
  await assertMember(req);
  const data = await videoService.listReplies({
    commentId: req.params.commentId,
    hotelId: req.params.hotelId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const addVideoComment = asyncHandler(async (req, res) => {
  await assertMember(req);
  const comment = await videoService.addComment({
    contentId: req.params.contentId,
    hotelId: req.params.hotelId,
    guestId: req.user._id,
    body: req.body.body,
    parentId: req.body.parentId || null,
  });
  res.status(201).json(new ApiResponse(201, { comment }, "Comment posted"));
});

export const toggleVideoCommentLike = asyncHandler(async (req, res) => {
  await assertMember(req);
  const data = await videoService.toggleCommentLike({
    commentId: req.params.commentId,
    hotelId: req.params.hotelId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const deleteVideoComment = asyncHandler(async (req, res) => {
  const { removed } = await videoService.deleteComment({
    commentId: req.params.commentId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, { removed }, "Comment removed"));
});

/* ----------------------------------------------------------------- bills -- */

/**
 * The guest's own bills.
 *
 * Scoped by req.user._id, never a query parameter — a guest must only ever see
 * their own. This is also what a reconnecting socket calls to pick up anything
 * pushed while it was away.
 */
export const listBills = asyncHandler(async (req, res) => {
  const data = await billService.listGuestBills({
    guestId: req.user._id,
    status: req.query.status,
    limit: Number(req.query.limit) || 20,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const getBill = asyncHandler(async (req, res) => {
  const bill = await billService.getBillForGuest({
    billId: req.params.billId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, { bill }));
});

/**
 * Opens a payment for a bill, applying the coins the guest chose.
 *
 * The coin figure is re-clamped server-side against the live balance and the
 * tier cap on the bill; the slider is a convenience, never the authority.
 */
export const payBill = asyncHandler(async (req, res) => {
  const data = await billService.startBillPayment({
    billId: req.params.billId,
    guestId: req.user._id,
    coinsRequested: req.body.coins || 0,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** Confirms a payment and settles the bill. */
export const confirmBill = asyncHandler(async (req, res) => {
  const data = await billService.markBillPaid({
    billId: req.params.billId,
    guestId: req.user._id,
    providerPaymentId: req.body.providerPaymentId,
    signature: req.body.signature,
  });
  res.status(200).json(new ApiResponse(200, data, "Payment complete"));
});

/** The guest declines a bill. Staff are told immediately. */
export const cancelBill = asyncHandler(async (req, res) => {
  const data = await billService.cancelBill({
    billId: req.params.billId,
    guestId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data, "Bill cancelled"));
});
