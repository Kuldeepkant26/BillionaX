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
} from "../validators/common.validator.js";

const router = Router();

router.use(protect, requireRole(ROLES.MAIN_ADMIN));

router.get("/dashboard", adminController.dashboard);

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

router.get("/settings", adminController.getSettings);
router.patch("/settings", settingsRules, validate, adminController.updateSettings);

export default router;
