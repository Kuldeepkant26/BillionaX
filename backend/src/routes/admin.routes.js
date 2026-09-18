import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  objectIdParam,
  paginationRules,
  hotelRules,
  hotelUserRules,
  sellCoinsRules,
  settingsRules,
  adminUserRules,
  adminUpdateRules,
  guestUpdateRules,
  txFilterRules,
  guestFilterRules,
  hotelFilterRules,
  monthlyReportRules,
  runRebateRules,
  paymentSettingsRules,
  onboardingRules,
  bankVerificationRules,
  supportMessageRules,
  supportPartyRule,
  searchRule,
  invoiceTemplateRules,
  invoiceFilterRules,
} from "../validators/common.validator.js";

const router = Router();

router.use(protect, requireRole(ROLES.MAIN_ADMIN));

router.get("/dashboard", adminController.dashboard);

// Month-wise redemption reporting and the month-end rebate.
router.get(
  "/reports/monthly-redemptions",
  monthlyReportRules,
  validate,
  adminController.monthlyRedemptions
);
router.get("/rebates", adminController.listSettlements);
router.post("/rebates/run", runRebateRules, validate, adminController.runRebate);

router.get("/hotels", paginationRules, hotelFilterRules, validate, adminController.listHotels);
router.post("/hotels", hotelRules, validate, adminController.createHotel);
// Registered before /hotels/:hotelId — a param route would otherwise match
// "cities" as an id and fail objectIdParam validation.
router.get("/hotels/cities", adminController.listHotelCities);
router.get("/hotels/:hotelId", objectIdParam("hotelId"), validate, adminController.getHotel);
router.patch("/hotels/:hotelId", objectIdParam("hotelId"), validate, adminController.updateHotel);

router.post(
  "/hotels/:hotelId/admins",
  objectIdParam("hotelId"),
  hotelUserRules,
  validate,
  adminController.createHotelAdmin
);
router.post(
  "/hotels/:hotelId/coins",
  objectIdParam("hotelId"),
  sellCoinsRules,
  validate,
  adminController.sellCoins
);
router.get(
  "/hotels/:hotelId/transactions",
  objectIdParam("hotelId"),
  paginationRules,
  txFilterRules,
  validate,
  adminController.hotelTransactions
);

router.delete("/hotels/:hotelId", objectIdParam("hotelId"), validate, adminController.deleteHotel);

router.get("/transactions", paginationRules, txFilterRules, validate, adminController.listTransactions);

// ---- guests (read / update / delete) ----
router.get("/guests", paginationRules, guestFilterRules, validate, adminController.listGuests);
router.get("/guests/:id", objectIdParam("id"), validate, adminController.getGuest);
router.patch("/guests/:id", objectIdParam("id"), guestUpdateRules, validate, adminController.updateGuest);
router.delete("/guests/:id", objectIdParam("id"), validate, adminController.deleteGuest);

// ---- platform admins ----
router.get("/admins", paginationRules, validate, adminController.listAdmins);
router.post("/admins", adminUserRules, validate, adminController.createAdmin);
router.patch("/admins/:id", objectIdParam("id"), adminUpdateRules, validate, adminController.updateAdmin);
router.delete("/admins/:id", objectIdParam("id"), validate, adminController.deleteAdmin);

/* ---- hotel onboarding ---- */

router.patch(
  "/hotels/:hotelId/onboarding",
  objectIdParam("hotelId"),
  onboardingRules,
  validate,
  adminController.saveOnboarding
);
router.post(
  "/hotels/:hotelId/bank-verification",
  objectIdParam("hotelId"),
  bankVerificationRules,
  validate,
  adminController.verifyBank
);
router.post(
  "/hotels/:hotelId/linked-account",
  objectIdParam("hotelId"),
  validate,
  adminController.createLinkedAccount
);

/* ---- payment credentials ---- */

router.get("/payments", adminController.getPaymentSettings);
router.patch("/payments", paymentSettingsRules, validate, adminController.savePaymentSettings);
router.delete("/payments", adminController.clearPaymentSettings);

router.get("/settings", adminController.getSettings);
router.patch("/settings", settingsRules, validate, adminController.updateSettings);

/* ---- invoices and the invoice template -------------------------------- */

// Registered before /invoices/:invoiceId — "template" and "preview" must not
// be read as invoice ids, the same ordering trap as /hotels/cities above.
router.get("/invoices/template", adminController.getInvoiceTemplate);
router.patch(
  "/invoices/template",
  invoiceTemplateRules,
  validate,
  adminController.updateInvoiceTemplate
);
// POST rather than GET: it carries the unsaved draft template in its body, and
// it is a pure render that persists nothing.
router.post(
  "/invoices/template/preview",
  invoiceTemplateRules,
  validate,
  adminController.previewInvoiceTemplate
);

router.get("/invoices", paginationRules, invoiceFilterRules, validate, adminController.listInvoices);
router.get(
  "/invoices/:invoiceId",
  objectIdParam("invoiceId"),
  validate,
  adminController.getInvoice
);
router.post(
  "/invoices/:invoiceId/resend",
  objectIdParam("invoiceId"),
  validate,
  adminController.resendInvoice
);

/* ---- support inbox ---------------------------------------------------- */

// Registered before /support/:userId would be — "unread-count" must not be
// read as a user id, the same ordering trap as /hotels/cities above.
router.get("/support/unread-count", adminController.supportUnreadCount);
// ?party=GUEST|HOTEL selects the channel on each of these; it defaults to the
// guest queue, so a client that predates the hotel channel is unaffected.
router.get(
  "/support",
  paginationRules,
  searchRule,
  supportPartyRule,
  validate,
  adminController.listSupportThreads
);
router.get(
  "/support/:userId",
  objectIdParam("userId"),
  supportPartyRule,
  validate,
  adminController.getSupportThread
);
router.post(
  "/support/:userId/read",
  objectIdParam("userId"),
  supportPartyRule,
  validate,
  adminController.markSupportThreadRead
);
router.post(
  "/support/:userId/messages",
  objectIdParam("userId"),
  supportMessageRules,
  supportPartyRule,
  validate,
  adminController.replyToSupportThread
);

export default router;
