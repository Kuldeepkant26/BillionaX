import { Router } from "express";
import * as guestController from "../controllers/guest.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  objectIdParam,
  paginationRules,
  createVoucherRules,
  joinHotelRules,
  memberDetailsRules,
  commentRules,
} from "../validators/common.validator.js";

const router = Router();

// Everything below is guest-only.
router.use(protect, requireRole(ROLES.GUEST));

router.patch("/profile", memberDetailsRules, validate, guestController.updateProfile);
router.post("/profile/avatar-upload", guestController.createAvatarUpload);

router.get("/memberships", guestController.listMemberships);
router.post("/memberships/join", joinHotelRules, validate, guestController.joinHotel);
router.get("/memberships/:hotelId", objectIdParam("hotelId"), validate, guestController.getMembership);
router.get(
  "/memberships/:hotelId/transactions",
  objectIdParam("hotelId"),
  paginationRules,
  validate,
  guestController.getMembershipTransactions
);

// ---- notifications ----
router.get("/notifications", paginationRules, validate, guestController.listNotifications);
router.get("/notifications/unread-count", guestController.notificationCount);
router.post("/notifications/read", guestController.markNotificationsRead);

router.post("/vouchers", createVoucherRules, validate, guestController.createVoucher);
router.get("/vouchers/active", guestController.getActiveVoucher);
router.delete("/vouchers/:id", objectIdParam("id"), validate, guestController.cancelVoucher);

router.get(
  "/hotels/:hotelId/content",
  objectIdParam("hotelId"),
  validate,
  guestController.getHotelContent
);

/* ---- offers ---------------------------------------------------------- */

router.get(
  "/hotels/:hotelId/offers/:contentId",
  objectIdParam("hotelId"),
  objectIdParam("contentId"),
  validate,
  guestController.getOffer
);

/* ---- videos ---------------------------------------------------------- */

router.get(
  "/hotels/:hotelId/videos",
  objectIdParam("hotelId"),
  paginationRules,
  validate,
  guestController.listVideos
);

router.get(
  "/hotels/:hotelId/videos/:contentId",
  objectIdParam("hotelId"),
  objectIdParam("contentId"),
  validate,
  guestController.getVideo
);

router.post(
  "/hotels/:hotelId/videos/:contentId/like",
  objectIdParam("hotelId"),
  objectIdParam("contentId"),
  validate,
  guestController.toggleVideoLike
);

router.get(
  "/hotels/:hotelId/videos/:contentId/comments",
  objectIdParam("hotelId"),
  objectIdParam("contentId"),
  paginationRules,
  validate,
  guestController.listVideoComments
);

router.post(
  "/hotels/:hotelId/videos/:contentId/comments",
  objectIdParam("hotelId"),
  objectIdParam("contentId"),
  commentRules,
  validate,
  guestController.addVideoComment
);

router.delete(
  "/comments/:commentId",
  objectIdParam("commentId"),
  validate,
  guestController.deleteVideoComment
);

export default router;
