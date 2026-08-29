import { Router } from "express";
import * as hotelController from "../controllers/hotel.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { requireRole, requireSameHotel } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { redeemLimiter } from "../middlewares/rateLimiter.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  objectIdParam,
  paginationRules,
  allocateRules,
  verifyVoucherRules,
  redeemVoucherRules,
  contentRules,
  offerRules,
  privilegeRules,
  hotelUserRules,
  buyCoinsRules,
  creditMemberRules,
  recordStayRules,
  hotelSettingsRules,
  txFilterRules,
  memberFilterRules,
  staffFilterRules,
  purchaseFilterRules,
  contentFilterRules,
  monthlyReportRules,
} from "../validators/common.validator.js";

const router = Router();

const HOTEL_ROLES = [ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF, ROLES.MAIN_ADMIN];
const adminOnly = requireRole(ROLES.HOTEL_ADMIN, ROLES.MAIN_ADMIN);

// Applied at router level so any route added later is hotel-scoped by default.
// Without this, one forgotten route leaks another hotel's financial data.
router.use(protect, requireRole(...HOTEL_ROLES), requireSameHotel);

// --- available to both hotel roles ---
router.post("/vouchers/verify", redeemLimiter, verifyVoucherRules, validate, hotelController.verifyVoucher);
router.post("/vouchers/redeem", redeemLimiter, redeemVoucherRules, validate, hotelController.redeemVoucher);
router.get("/transactions", paginationRules, txFilterRules, validate, hotelController.listTransactions);
router.get("/members", paginationRules, memberFilterRules, validate, hotelController.listMembers);

// --- hotel admin only ---
router.get("/dashboard", adminOnly, hotelController.dashboard);
router.get(
  "/reports/monthly-redemptions",
  adminOnly,
  monthlyReportRules,
  validate,
  hotelController.monthlyRedemptions
);
router.get("/rebates", adminOnly, hotelController.listSettlements);
router.post("/members/allocate", adminOnly, allocateRules, validate, hotelController.allocate);

router.get("/coins/balance", adminOnly, hotelController.coinBalance);
router.get(
  "/coins/purchases",
  adminOnly,
  paginationRules,
  purchaseFilterRules,
  validate,
  hotelController.listPurchases
);
router.get("/coins/packs", adminOnly, hotelController.listPacks);
router.post("/coins/buy", adminOnly, buyCoinsRules, validate, hotelController.buyCoins);

router.post(
  "/members/:id/credit",
  adminOnly,
  objectIdParam("id"),
  creditMemberRules,
  validate,
  hotelController.creditMember
);
router.post(
  "/members/:id/stay",
  adminOnly,
  objectIdParam("id"),
  recordStayRules,
  validate,
  hotelController.recordStay
);

router.post("/content/image-upload", adminOnly, hotelController.createContentUpload);
router.post("/content/video-upload", adminOnly, hotelController.createContentVideoUpload);

router.get("/contents", adminOnly, paginationRules, contentFilterRules, validate, hotelController.content.list);
router.post("/contents", adminOnly, contentRules, validate, hotelController.content.create);
router.patch("/contents/:id", adminOnly, objectIdParam("id"), validate, hotelController.content.update);
router.delete("/contents/:id", adminOnly, objectIdParam("id"), validate, hotelController.content.remove);

router.get("/offers", adminOnly, paginationRules, contentFilterRules, validate, hotelController.offers.list);
router.post("/offers", adminOnly, offerRules, validate, hotelController.offers.create);
// PATCH validates too, unlike the other kinds: an unchecked validTo here would
// drive the expiry sweep, so a bad date could delete an offer outright.
router.patch(
  "/offers/:id",
  adminOnly,
  objectIdParam("id"),
  offerRules,
  validate,
  hotelController.offers.update
);
router.delete("/offers/:id", adminOnly, objectIdParam("id"), validate, hotelController.offers.remove);

router.get("/videos", adminOnly, paginationRules, contentFilterRules, validate, hotelController.videos.list);
router.post("/videos", adminOnly, contentRules, validate, hotelController.videos.create);
router.patch("/videos/:id", adminOnly, objectIdParam("id"), validate, hotelController.videos.update);
router.delete("/videos/:id", adminOnly, objectIdParam("id"), validate, hotelController.videos.remove);

// Unlike contents/offers above, PATCH here runs the body rules too — an
// unvalidated PATCH is how an over-long valueLabel or a bogus tier reaches
// Mongoose and surfaces as a 500 instead of a 422 with a field error.
router.get(
  "/privileges",
  adminOnly,
  paginationRules,
  contentFilterRules,
  validate,
  hotelController.privileges.list
);
router.post("/privileges", adminOnly, privilegeRules, validate, hotelController.privileges.create);
router.patch(
  "/privileges/:id",
  adminOnly,
  objectIdParam("id"),
  privilegeRules,
  validate,
  hotelController.privileges.update
);
router.delete(
  "/privileges/:id",
  adminOnly,
  objectIdParam("id"),
  validate,
  hotelController.privileges.remove
);

router.get("/staff", adminOnly, paginationRules, staffFilterRules, validate, hotelController.listStaff);
router.post("/staff", adminOnly, hotelUserRules, validate, hotelController.createStaff);
router.patch("/staff/:id", adminOnly, objectIdParam("id"), validate, hotelController.setStaffActive);

router.get("/settings", adminOnly, hotelController.getSettings);
router.post("/settings/logo-upload", adminOnly, hotelController.createLogoUpload);
router.patch("/settings", adminOnly, hotelSettingsRules, validate, hotelController.updateSettings);

export default router;
