import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ROLES } from "../config/constants.js";
import * as hotelService from "../services/hotel.service.js";
import * as coinService from "../services/coin.service.js";
import * as reportService from "../services/report.service.js";
import * as settingsService from "../services/settings.service.js";
import * as adminUserService from "../services/adminUser.service.js";
import * as rebateService from "../services/rebate.service.js";
import * as paymentSettingsService from "../services/paymentSettings.service.js";
import * as onboardingService from "../services/onboarding.service.js";

export const dashboard = asyncHandler(async (req, res) => {
  const data = await reportService.adminDashboard();
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * Coins redeemed by month across the network, or for one hotel via ?hotelId.
 * ?from / ?to override the default trailing window.
 */
export const monthlyRedemptions = asyncHandler(async (req, res) => {
  const { hotelId, from, to, months } = req.query;
  const data = await reportService.monthlyRedemptions({
    hotelId: hotelId || null,
    from,
    to,
    months: months ? Number(months) : undefined,
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listSettlements = asyncHandler(async (req, res) => {
  const { hotelId, limit } = req.query;
  const settlements = await rebateService.listSettlements({
    hotelId: hotelId || null,
    limit: limit ? Number(limit) : undefined,
  });
  res.status(200).json(new ApiResponse(200, { settlements }));
});

/**
 * Runs the month-end rebate on demand.
 *
 * Idempotent by construction: a hotel already settled for the period is
 * skipped, so clicking twice cannot pay twice. Defaults to the previous
 * calendar month, which is what "run it for last month" means.
 */
export const runRebate = asyncHandler(async (req, res) => {
  const { period, hotelId, dryRun } = req.body;

  const result = await rebateService.runMonthlyRebate({
    period: period || undefined,
    hotelId: hotelId || null,
    runBy: req.user._id,
    dryRun: Boolean(dryRun),
  });

  const message = result.dryRun
    ? `${result.settled.length} hotel(s) would be credited ${result.totalCredited.toLocaleString("en-IN")} coins`
    : result.settled.length
      ? `Credited ${result.totalCredited.toLocaleString("en-IN")} coins to ${result.settled.length} hotel(s)`
      : "Nothing to credit — this period is already settled";

  res.status(200).json(new ApiResponse(200, result, message));
});

export const listHotels = asyncHandler(async (req, res) => {
  const { q, isActive, city, lowInventory, page = 1, limit = 25 } = req.query;
  const data = await hotelService.listHotels({
    q,
    isActive,
    city,
    lowInventory,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** Distinct cities for the hotels filter dropdown. */
export const listHotelCities = asyncHandler(async (req, res) => {
  const cities = await hotelService.listHotelCities();
  res.status(200).json(new ApiResponse(200, { cities }));
});

export const createHotel = asyncHandler(async (req, res) => {
  const hotel = await hotelService.createHotel(req.body);
  res.status(201).json(new ApiResponse(201, { hotel }, `${hotel.name} registered`));
});

export const getHotel = asyncHandler(async (req, res) => {
  const [hotel, staffPage, purchasePage, qr] = await Promise.all([
    hotelService.getHotelOrFail(req.params.hotelId),
    // Bounded rather than unlimited: this composite previously loaded every
    // staff row and every purchase a hotel had ever made. The detail page only
    // renders a summary, so a generous cap is enough.
    hotelService.listHotelStaff({ hotelId: req.params.hotelId, limit: 100 }),
    coinService.listPurchases({ hotelId: req.params.hotelId, limit: 100 }),
    hotelService.getQrToken(req.params.hotelId),
  ]);

  res.status(200).json(
    new ApiResponse(200, {
      hotel,
      // Kept as bare arrays — the detail page maps over them directly.
      staff: staffPage.staff,
      purchases: purchasePage.purchases,
      staffTotal: staffPage.total,
      purchaseTotal: purchasePage.total,
      qr,
    })
  );
});

export const updateHotel = asyncHandler(async (req, res) => {
  const hotel = await hotelService.updateHotel(req.params.hotelId, req.body);
  res.status(200).json(new ApiResponse(200, { hotel }, "Hotel updated"));
});

export const createHotelAdmin = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const user = await hotelService.createHotelUser({
    hotelId: req.params.hotelId,
    name,
    email,
    password,
    role: role || ROLES.HOTEL_ADMIN,
  });
  res.status(201).json(new ApiResponse(201, { user }, "Hotel account created"));
});

export const sellCoins = asyncHandler(async (req, res) => {
  const { coins, amountPaid, paymentRef, note } = req.body;

  const result = await coinService.recordPurchase({
    hotelId: req.params.hotelId,
    coins: Number(coins),
    amountPaid: Number(amountPaid),
    paymentRef,
    note,
    recordedBy: req.user._id,
  });

  res
    .status(201)
    .json(new ApiResponse(201, result, `${coins} coins added to the hotel's inventory`));
});

export const hotelTransactions = asyncHandler(async (req, res) => {
  const { type, outlet, minCoins, from, to, page = 1, limit = 25 } = req.query;
  const data = await reportService.listTransactions({
    hotelId: req.params.hotelId,
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

export const listTransactions = asyncHandler(async (req, res) => {
  const { type, hotelId, outlet, minCoins, minBillAmount, from, to, page = 1, limit = 25 } =
    req.query;
  const data = await reportService.listTransactions({
    type,
    hotelId,
    outlet,
    minCoins,
    minBillAmount,
    from,
    to,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const listGuests = asyncHandler(async (req, res) => {
  const { q, hasBalance, joinedFrom, joinedTo, page = 1, limit = 25 } = req.query;
  const data = await reportService.listGuests({
    q,
    hasBalance,
    joinedFrom,
    joinedTo,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const deleteHotel = asyncHandler(async (req, res) => {
  await adminUserService.deleteHotel(req.params.hotelId);
  res.status(200).json(new ApiResponse(200, null, "Hotel removed"));
});

// ---- platform admins ----

export const listAdmins = asyncHandler(async (req, res) => {
  const { isActive, page = 1, limit = 25 } = req.query;
  const data = await adminUserService.listAdmins({
    isActive,
    page: Number(page),
    limit: Number(limit),
  });
  res.status(200).json(new ApiResponse(200, data));
});

export const createAdmin = asyncHandler(async (req, res) => {
  const user = await adminUserService.createAdmin(req.body);
  res.status(201).json(new ApiResponse(201, { user }, "Admin created"));
});

export const updateAdmin = asyncHandler(async (req, res) => {
  const user = await adminUserService.updateAdmin({ userId: req.params.id, ...req.body });
  res.status(200).json(new ApiResponse(200, { user }, "Admin updated"));
});

export const deleteAdmin = asyncHandler(async (req, res) => {
  await adminUserService.deleteAdmin({ userId: req.params.id, actingUserId: req.user._id });
  res.status(200).json(new ApiResponse(200, null, "Admin removed"));
});

// ---- guests ----

export const getGuest = asyncHandler(async (req, res) => {
  const data = await adminUserService.getGuest(req.params.id);
  res.status(200).json(new ApiResponse(200, data));
});

export const updateGuest = asyncHandler(async (req, res) => {
  const guest = await adminUserService.updateGuest({ guestId: req.params.id, ...req.body });
  res.status(200).json(new ApiResponse(200, { guest }, "Guest updated"));
});

export const deleteGuest = asyncHandler(async (req, res) => {
  await adminUserService.deleteGuest(req.params.id);
  res.status(200).json(new ApiResponse(200, null, "Guest removed"));
});

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.getSettings({ fresh: true });
  res.status(200).json(new ApiResponse(200, { settings }));
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body, req.user._id);
  res.status(200).json(new ApiResponse(200, { settings }, "Settings saved"));
});

/* -------------------------------------------------------------- payments -- */

/** Credential status for the panel. Never includes a secret. */
export const getPaymentSettings = asyncHandler(async (req, res) => {
  const data = await paymentSettingsService.getPaymentSettings();
  res.status(200).json(new ApiResponse(200, data));
});

/**
 * Saves Razorpay credentials.
 *
 * The key pair is checked against Razorpay before anything is stored, so a
 * typo cannot leave the platform believing it is live when it is not.
 */
export const savePaymentSettings = asyncHandler(async (req, res) => {
  const data = await paymentSettingsService.savePaymentSettings({
    keyId: req.body.keyId,
    keySecret: req.body.keySecret,
    webhookSecret: req.body.webhookSecret,
    routeEnabled: req.body.routeEnabled,
    transferHoldHours: req.body.transferHoldHours,
    userId: req.user._id,
  });
  res.status(200).json(new ApiResponse(200, data, "Payment settings saved"));
});

/** Removes stored credentials; the platform returns to demo on next restart. */
export const clearPaymentSettings = asyncHandler(async (req, res) => {
  const data = await paymentSettingsService.clearPaymentSettings(req.user._id);
  res.status(200).json(new ApiResponse(200, data, "Payment credentials removed"));
});

/* ------------------------------------------------------------ onboarding -- */

/** Saves a hotel's KYC details and terms acceptance. */
export const saveOnboarding = asyncHandler(async (req, res) => {
  const hotel = await onboardingService.saveOnboarding({
    hotelId: req.params.hotelId,
    business: req.body.business,
    stakeholder: req.body.stakeholder,
    agreement: req.body.agreement,
    userId: req.user._id,
    // Recorded with the acceptance, since "they agreed" needs a where.
    ip: req.ip,
  });
  res.status(200).json(new ApiResponse(200, { hotel }, "Onboarding saved"));
});

/**
 * Starts a reverse penny drop.
 *
 * Returns a UPI link for the owner to pay ₹1 from their own app, which is what
 * proves they control the account.
 */
export const verifyBank = asyncHandler(async (req, res) => {
  const data = await onboardingService.startBankVerification({
    hotelId: req.params.hotelId,
    ifsc: req.body.ifsc,
    accountNumber: req.body.accountNumber,
    beneficiaryName: req.body.beneficiaryName,
  });
  res.status(200).json(new ApiResponse(200, data));
});

/** Creates the Route linked account from the VERIFIED bank details. */
export const createLinkedAccount = asyncHandler(async (req, res) => {
  const data = await onboardingService.createLinkedAccount({
    hotelId: req.params.hotelId,
    // An admin may override a name mismatch, but only deliberately.
    force: Boolean(req.body.force),
  });
  res.status(200).json(new ApiResponse(200, data, "Payout account created"));
});
