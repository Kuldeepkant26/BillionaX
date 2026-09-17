import { Router } from "express";
import * as guestController from "../controllers/guest.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ROLES } from "../config/constants.js";
import {
  objectIdParam,
  paginationRules,
  joinHotelRules,
  memberDetailsRules,
  commentRules,
  payBillRules,
  supportMessageRules,
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

// ---- help centre chat ----
// No pagination: a support thread is read whole, oldest first. See
// support.service.js for why.
router.get("/support/messages", guestController.listSupportMessages);
router.get("/support/unread-count", guestController.supportUnreadCount);
router.post("/support/read", guestController.markSupportRead);
router.post(
  "/support/messages",
  supportMessageRules,
  validate,
  guestController.sendSupportMessage
);

/* ---- the guest's thread with one of their HOTELS ---- */

/*
 * Keyed by hotel, unlike the platform thread above: a guest belongs to several
 * properties and each is a separate conversation.
 *
 * Registered before the :hotelId paths so "unread-count" is never read as a
 * hotel id — the same ordering trap as /support/unread-count above.
 *
 * The id is validated as an ObjectId here and checked for MEMBERSHIP in the
 * controller. Both matter: this rejects a malformed id with a 422 before it
 * reaches mongo, and the controller rejects a well-formed id for a hotel this
 * guest has never joined.
 */
router.get("/support/hotels/unread-count", guestController.hotelChatUnreadCount);
router.get(
  "/support/hotels/:hotelId/messages",
  objectIdParam("hotelId"),
  validate,
  guestController.listHotelChatMessages
);
router.post(
  "/support/hotels/:hotelId/read",
  objectIdParam("hotelId"),
  validate,
  guestController.markHotelChatRead
);
router.post(
  "/support/hotels/:hotelId/messages",
  objectIdParam("hotelId"),
  supportMessageRules,
  validate,
  guestController.sendHotelChatMessage
);


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
  payBillRules,
  validate,
  guestController.addVideoComment
);

router.get(
  "/hotels/:hotelId/comments/:commentId/replies",
  objectIdParam("hotelId"),
  objectIdParam("commentId"),
  validate,
  guestController.listVideoCommentReplies
);

router.post(
  "/hotels/:hotelId/comments/:commentId/like",
  objectIdParam("hotelId"),
  objectIdParam("commentId"),
  validate,
  guestController.toggleVideoCommentLike
);

router.delete(
  "/comments/:commentId",
  objectIdParam("commentId"),
  validate,
  guestController.deleteVideoComment
);

/* ---- bills ---- */

router.get("/bills", guestController.listBills);
router.get("/bills/:billId", objectIdParam("billId"), validate, guestController.getBill);
router.post(
  "/bills/:billId/pay",
  objectIdParam("billId"),
  payBillRules,
  validate,
  guestController.payBill
);
router.post(
  "/bills/:billId/confirm",
  objectIdParam("billId"),
  payBillRules,
  validate,
  guestController.confirmBill
);
router.post(
  "/bills/:billId/cancel",
  objectIdParam("billId"),
  validate,
  guestController.cancelBill
);

export default router;
