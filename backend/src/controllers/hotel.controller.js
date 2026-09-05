import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { ROLES, CONTENT_KINDS } from "../config/constants.js";
import * as coinService from "../services/coin.service.js";
import * as contentService from "../services/content.service.js";
import * as reportService from "../services/report.service.js";
import * as rebateService from "../services/rebate.service.js";
import * as hotelService from "../services/hotel.service.js";
import * as membershipService from "../services/membership.service.js";
import * as uploadService from "../services/upload.service.js";
import * as videoService from "../services/video.service.js";
import * as billService from "../services/bill.service.js";

/** Main admin must target a hotel explicitly; staff are pinned to their own. */
const hotelIdFor = (req) => {
  if (!req.hotelId) throw new ApiError(400, "A hotelId is required");
  return req.hotelId;
};

export const dashboard = asyncHandler(async (req, res) => {
  const data = await reportService.hotelDashboard(hotelIdFor(req));
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * This hotel's coins redeemed by month, with the rebate credited against each.
 *
 * hotelId comes from hotelIdFor(req), never from the query — a hotel must not
 * be able to read another's figures by passing an id.
 */
export const monthlyRedemptions = asyncHandler(async (req, res) => {
  const { from, to, months } = req.query;
  const data = await reportService.monthlyRedemptions({
    hotelId: hotelIdFor(req),
    from,
    to,
    months: months ? Number(months) : undefined,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listSettlements = asyncHandler(async (req, res) => {
  const settlements = await rebateService.listSettlements({ hotelId: hotelIdFor(req) });
  res.status(200).json(new ApiResponse(200, { settlements }));
});

export const listMembers = asyncHandler(async (req, res) => {
  const { q, tier, minBalance, maxBalance, joinedFrom, joinedTo, page = 1, limit = 25 } = req.query;
  const data = await reportService.listMembers({
    hotelId: hotelIdFor(req),
    q,
    tier,
    minBalance,
    maxBalance,
    joinedFrom,
    joinedTo,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const allocate = asyncHandler(async (req, res) => {
  const { phone, name, roomAmount, nights, ratePercent, idempotencyKey } = req.body;

  const result = await coinService.allocateCoins({
    hotelId: hotelIdFor(req),
    phone,
    name,
    roomAmount: Number(roomAmount),
    nights: Number(nights),
    ratePercent: ratePercent === undefined ? undefined : Number(ratePercent),
    performedBy: req.user._id,
    idempotencyKey,
  });

  res
    .status(201)
    .json(new ApiResponse(201, result, `${result.coinsAllocated} coins added to the guest`));
});

export const listTransactions = asyncHandler(async (req, res) => {
  const { type, outlet, minCoins, from, to, page = 1, limit = 25 } = req.query;

  // Bills that moved no coins (cancelled, expired, cash-only) ride along on
  // the unfiltered first page, for the reasons set out in the guest
  // controller's copy of this: they are not coin-ledger rows, and a filtered
  // or paged view must not gain rows the filter excludes.
  const wantsBills = !type && !outlet && !minCoins && !from && !to && Number(page) === 1;

  const [data, bills] = await Promise.all([
    reportService.listTransactions({
      hotelId: hotelIdFor(req),
      type,
      outlet,
      minCoins,
      from,
      to,
      page: Number(page),
      limit: Number(limit),
    }),
    wantsBills
      ? billService.listBillHistory({ hotelId: hotelIdFor(req), limit: Number(limit) })
      : Promise.resolve({ items: [] }),
  ]);

  res.status(200).json(new ApiResponse(200, { ...data, bills: bills.items }));
});

export const coinBalance = asyncHandler(async (req, res) => {
  const hotel = await hotelService.getHotelOrFail(hotelIdFor(req));
  res.status(200).json(
    new ApiResponse(200, {
      coinInventory: hotel.coinInventory,
      totalCoinsPurchased: hotel.totalCoinsPurchased,
      totalCoinsAllocated: hotel.totalCoinsAllocated,
      totalCoinsRedeemed: hotel.totalCoinsRedeemed,
    })
  );
});

export const listPurchases = asyncHandler(async (req, res) => {
  const { status, from, to, page = 1, limit = 25 } = req.query;
  const data = await coinService.listPurchases({
    hotelId: hotelIdFor(req),
    status,
    from,
    to,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listPacks = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, { packs: coinService.COIN_PACKS }));
});

export const buyCoins = asyncHandler(async (req, res) => {
  const { packId, coins, price, paymentMethod } = req.body;

  const result = await coinService.purchaseCoinPack({
    hotelId: hotelIdFor(req),
    packId,
    coins,
    price,
    paymentMethod,
    purchasedBy: req.user._id,
  });

  res
    .status(201)
    .json(new ApiResponse(201, result, `${result.purchase.coins} coins added to your inventory`));
});

export const creditMember = asyncHandler(async (req, res) => {
  const { coins, note, idempotencyKey } = req.body;

  const result = await coinService.creditMember({
    hotelId: hotelIdFor(req),
    membershipId: req.params.id,
    coins: Number(coins),
    note,
    performedBy: req.user._id,
    idempotencyKey,
  });

  res.status(200).json(new ApiResponse(200, result, `${result.coinsCredited} coins added`));
});

export const recordStay = asyncHandler(async (req, res) => {
  const { nights, amount, note, idempotencyKey } = req.body;

  const result = await coinService.recordStay({
    hotelId: hotelIdFor(req),
    membershipId: req.params.id,
    nights: Number(nights),
    amount: Number(amount),
    note,
    performedBy: req.user._id,
    idempotencyKey,
  });

  const message = result.tierChanged
    ? `Stay recorded — ${result.coinsCredited} coins added, guest is now ${result.tier}`
    : `Stay recorded — ${result.coinsCredited} coins added`;

  res.status(200).json(new ApiResponse(200, result, message));
});

// ---- content / offers / privileges ----

const contentHandlers = (kind) => ({
  list: asyncHandler(async (req, res) => {
    const { isActive, currentlyValid, expired, scheduled, page = 1, limit = 25 } = req.query;
    const data = await contentService.listContent({
      hotelId: hotelIdFor(req),
      kind,
      isActive,
      currentlyValid,
      expired,
      scheduled,
      paginate: true,
      page: Number(page),
      limit: Number(limit),
    });
    res.status(200).json(new ApiResponse(200, data));
  }),
  create: asyncHandler(async (req, res) => {
    const item = await contentService.createContent({
      hotelId: hotelIdFor(req),
      kind,
      ...req.body,
    });
    res.status(201).json(new ApiResponse(201, { item }, "Saved"));
  }),
  update: asyncHandler(async (req, res) => {
    const item = await contentService.updateContent({
      id: req.params.id,
      hotelId: hotelIdFor(req),
      patch: req.body,
    });
    res.status(200).json(new ApiResponse(200, { item }, "Updated"));
  }),
  remove: asyncHandler(async (req, res) => {
    await contentService.deleteContent({ id: req.params.id, hotelId: hotelIdFor(req) });
    res.status(200).json(new ApiResponse(200, null, "Deleted"));
  }),
});

export const content = contentHandlers(CONTENT_KINDS.CONTENT);
export const offers = contentHandlers(CONTENT_KINDS.OFFER);
export const videos = contentHandlers(CONTENT_KINDS.VIDEO);

// Note the admin list passes no `tier`, so a manager sees every privilege
// regardless of who it targets — they are managing them, not consuming them.
export const privileges = contentHandlers(CONTENT_KINDS.PRIVILEGE);

// ---- staff ----

export const listStaff = asyncHandler(async (req, res) => {
  const { role, isActive, page = 1, limit = 25 } = req.query;
  const data = await hotelService.listHotelStaff({
    hotelId: hotelIdFor(req),
    role,
    isActive,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const createStaff = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const user = await hotelService.createHotelUser({
    hotelId: hotelIdFor(req),
    name,
    email,
    password,
    role: role || ROLES.HOTEL_STAFF,
  });
  res.status(201).json(new ApiResponse(201, { user }, "Staff account created"));
});

export const setStaffActive = asyncHandler(async (req, res) => {
  const user = await hotelService.setUserActive({
    userId: req.params.id,
    hotelId: hotelIdFor(req),
    isActive: Boolean(req.body.isActive),
  });
  res.status(200).json(new ApiResponse(200, { user }, "Updated"));
});

// ---- settings ----

export const getSettings = asyncHandler(async (req, res) => {
  const hotel = await hotelService.getHotelOrFail(hotelIdFor(req));
  const qr = await hotelService.getQrToken(hotel._id);

  res.status(200).json(
    new ApiResponse(200, {
      hotel: {
        id: hotel._id,
        name: hotel.name,
        slug: hotel.slug,
        city: hotel.city,
        address: hotel.address,
        phone: hotel.phone,
        email: hotel.email,
        logoUrl: hotel.logoUrl,
        earnRatePercent: hotel.earnRatePercent,
        tierCaps: hotel.tierCaps,
        tierNightThresholds: hotel.tierNightThresholds,
        tierEarnRates: hotel.tierEarnRates,
      },
      qr,
    })
  );
});

/**
 * Signature for a content/offer/privilege image.
 *
 * Unlike the logo, the public_id carries a random suffix rather than the row
 * id: a row's image can be replaced many times, and reusing one id would make
 * Cloudinary's CDN serve the previous picture from cache. A fresh id per
 * upload sidesteps that entirely — the old asset is deleted explicitly once
 * the new URL is saved.
 */
export const createContentUpload = asyncHandler(async (req, res) => {
  const data = uploadService.createUploadSignature({
    folder: "content",
    publicId: `hotel_${hotelIdFor(req)}_${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * The same one-shot signature, but for Cloudinary's video pipeline.
 *
 * A separate endpoint rather than a query flag: the resource type decides the
 * upload URL and how the asset is later deleted, so making it explicit at the
 * route keeps a video from ever being signed as an image.
 */
export const createContentVideoUpload = asyncHandler(async (req, res) => {
  const data = uploadService.createUploadSignature({
    folder: "videos",
    publicId: `hotel_${hotelIdFor(req)}_${Date.now().toString(36)}${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    resourceType: "video",
  });
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * One-shot signature for the hotel's logo upload. public_id is derived from the
 * hotel id and baked into the signature, so a manager can only ever overwrite
 * their OWN logo — requireSameHotel already pins which hotel that is.
 */
export const createLogoUpload = asyncHandler(async (req, res) => {
  const data = uploadService.createUploadSignature({
    folder: "hotels",
    publicId: `hotel_${hotelIdFor(req)}`,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const hotelId = hotelIdFor(req);
  const hotel = await hotelService.updateHotel(hotelId, req.body);

  // Moving the night bars re-ranks everyone who already stayed, so members do
  // not sit on a tier the new rules no longer support (or miss one they now
  // qualify for) until their next stay happens to trigger a recompute.
  let retiered = 0;
  if (req.body?.tierNightThresholds) {
    retiered = await membershipService.retierHotelMembers(hotelId);
  }

  res
    .status(200)
    .json(new ApiResponse(200, { hotel, retiered }, "Settings saved"));
});

/* ------------------------------------------------------- video comments -- */

/**
 * The comment thread on one of this hotel's videos, for the panel's preview.
 *
 * hotelId comes from the session, never the query — the same rule as every
 * other read here.
 */
export const videoComments = asyncHandler(async (req, res) => {
  const data = await videoService.listCommentsForHotel({
    contentId: req.params.contentId,
    hotelId: hotelIdFor(req),
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** Moderation: a hotel removes a comment posted on its own video. */
export const deleteVideoComment = asyncHandler(async (req, res) => {
  const { removed } = await videoService.deleteCommentAsHotel({
    commentId: req.params.commentId,
    hotelId: hotelIdFor(req),
  });
  res.status(200).json(new ApiResponse(200, { removed }, "Comment removed"));
});

/* ----------------------------------------------------------------- bills -- */

/**
 * Guests at THIS hotel, for the bill screen's search.
 *
 * hotelId comes from hotelIdFor(req) and nowhere else, so a staff member
 * cannot search another property's guests by passing an id. The response
 * carries masked email addresses only.
 */
export const searchGuests = asyncHandler(async (req, res) => {
  const data = await billService.searchGuests({
    hotelId: hotelIdFor(req),
    q: req.query.q,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 10,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** The full email, for the identity check before a bill is sent. */
export const revealGuestEmail = asyncHandler(async (req, res) => {
  const data = await billService.revealGuestEmail({
    hotelId: hotelIdFor(req),
    guestId: req.params.guestId,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** The running total in the composer, priced by the same code that stores it. */
export const priceBill = asyncHandler(async (req, res) => {
  const data = billService.priceBill({
    lineItems: req.body.lineItems,
    taxPercent: req.body.taxPercent,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const createBill = asyncHandler(async (req, res) => {
  const bill = await billService.createBill({
    hotelId: hotelIdFor(req),
    guestId: req.body.guestId,
    staffId: req.user._id,
    lineItems: req.body.lineItems,
    taxPercent: req.body.taxPercent,
    outlet: req.body.outlet,
  });
  res.status(201).json(new ApiResponse(201, { bill }, "Bill sent"));
});

/**
 * Voids a pending bill from the panel.
 *
 * The service decides whether this user may: an admin can void any of their
 * hotel's bills, a staff member only one they sent. Passing the role rather
 * than gating the route lets both cases share one endpoint.
 */
export const cancelBill = asyncHandler(async (req, res) => {
  const data = await billService.cancelBillByStaff({
    billId: req.params.billId,
    hotelId: hotelIdFor(req),
    staffId: req.user._id,
    isAdmin: req.user.role === ROLES.HOTEL_ADMIN,
  });
  res.status(200).json(new ApiResponse(200, data, "Bill cancelled"));
});

/**
 * This hotel's bills — the live pending list AND the history view.
 *
 * `status` may repeat (?status=PAID&status=CANCELLED), which express parses
 * into an array; the history tab uses that to ask for the three terminal
 * states in one query. A single value still works, so the pending list is
 * unchanged.
 */
export const listBills = asyncHandler(async (req, res) => {
  const data = await billService.listHotelBills({
    hotelId: hotelIdFor(req),
    status: req.query.status,
    q: req.query.q,
    outlet: req.query.outlet,
    from: req.query.from,
    to: req.query.to,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** One bill in full, for the panel's detail view. */
export const getBill = asyncHandler(async (req, res) => {
  const bill = await billService.getBillForHotel({
    billId: req.params.billId,
    hotelId: hotelIdFor(req),
  });
  res.status(200).json(new ApiResponse(200, { bill }));
});
