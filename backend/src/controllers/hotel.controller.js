import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { ROLES, CONTENT_KINDS } from "../config/constants.js";
import * as coinService from "../services/coin.service.js";
import * as voucherService from "../services/voucher.service.js";
import * as contentService from "../services/content.service.js";
import * as reportService from "../services/report.service.js";
import * as hotelService from "../services/hotel.service.js";
import * as membershipService from "../services/membership.service.js";
import * as uploadService from "../services/upload.service.js";

/** Main admin must target a hotel explicitly; staff are pinned to their own. */
const hotelIdFor = (req) => {
  if (!req.hotelId) throw new ApiError(400, "A hotelId is required");
  return req.hotelId;
};

export const dashboard = asyncHandler(async (req, res) => {
  const data = await reportService.hotelDashboard(hotelIdFor(req));
  res.status(200).json(new ApiResponse(200, data));
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

export const verifyVoucher = asyncHandler(async (req, res) => {
  const { code, billAmount } = req.body;
  const data = await voucherService.verifyVoucher({
    code,
    hotelId: hotelIdFor(req),
    billAmount: billAmount ? Number(billAmount) : 0,
  });
  res.status(200).json(new ApiResponse(200, data, "Code is valid"));
});

export const redeemVoucher = asyncHandler(async (req, res) => {
  const { code, billAmount, outlet, idempotencyKey } = req.body;

  const result = await voucherService.redeemVoucher({
    code,
    hotelId: hotelIdFor(req),
    billAmount: Number(billAmount),
    outlet,
    performedBy: req.user._id,
    idempotencyKey,
  });

  res
    .status(200)
    .json(new ApiResponse(200, result, `${result.coinsApplied} coins applied to the bill`));
});

export const listTransactions = asyncHandler(async (req, res) => {
  const { type, outlet, minCoins, from, to, page = 1, limit = 25 } = req.query;
  const data = await reportService.listTransactions({
    hotelId: hotelIdFor(req),
    type,
    outlet,
    minCoins,
    from,
    to,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
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
    const { isActive, currentlyValid, page = 1, limit = 25 } = req.query;
    const data = await contentService.listContent({
      hotelId: hotelIdFor(req),
      kind,
      isActive,
      currentlyValid,
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
