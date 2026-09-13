import { Router } from "express";
import * as feedController from "../controllers/feed.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { ROLES } from "../config/constants.js";
import { feedUploadLimiter } from "../middlewares/rateLimiter.middleware.js";
import {
  commentRules,
  feedCaptionRules,
  feedPostRules,
  objectIdParam,
  paginationRules,
  searchRule,
} from "../validators/common.validator.js";

const router = Router();

/**
 * `protect` ONLY — no requireRole, and deliberately no requireSameHotel.
 *
 * The feed is global: every authenticated role reads and writes the same one
 * collection, so there is nothing to scope by hotel and no role that is shut
 * out of the endpoint itself. This is the only router in the app without
 * requireSameHotel, and that is a product decision, not an oversight.
 *
 * It does mean this router loses the safety net rbac.middleware.js describes,
 * where a newly added route is scoped by default. Two things stand in its
 * place, and both matter:
 *
 *   1. No function in feed.service.js ever takes a hotel filter from client
 *      input. The hotel-scoped reads derive hotelId from req.user's own record.
 *   2. Role-specific powers — deleting someone else's post — are gated inside
 *      the service against the actor, because they are about WHICH ROW may be
 *      touched, not which endpoint may be called.
 *
 * The two endpoints that genuinely belong to one role (the panel's own lists)
 * carry their own requireRole, since there the ENDPOINT is the thing that is
 * role-specific.
 */
router.use(protect);

/* ---- reading the feed ------------------------------------------------- */

router.get("/", paginationRules, validate, feedController.listFeed);

// These literal segments all sit before /posts/:postId, which is a different
// prefix — but "saved", "mine", "hotel" and "moderation" are grouped here so
// the ordering rule stays visible in one place.
router.get("/saved", paginationRules, validate, feedController.listSavedPosts);

router.get("/mine", paginationRules, validate, feedController.listMyPosts);

// requireRole here, unlike everywhere else in this router, because the ENDPOINT
// is what is role-specific — a guest has no hotel to list posts for. Contrast
// the deletes, where the role decides which ROW may be touched and the gate
// therefore belongs in the service.
router.get(
  "/hotel",
  requireRole(ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF),
  paginationRules,
  validate,
  feedController.listHotelPosts
);

router.get(
  "/moderation",
  requireRole(ROLES.MAIN_ADMIN),
  paginationRules,
  searchRule,
  validate,
  feedController.listModerationPosts
);

router.get("/posts/:postId", objectIdParam("postId"), validate, feedController.getPost);

router.get(
  "/users/:userId/posts",
  objectIdParam("userId"),
  paginationRules,
  validate,
  feedController.listUserPosts
);

/* ---- writing ---------------------------------------------------------- */

router.post("/posts", feedPostRules, validate, feedController.createPost);

// Caption only. A post's images are immutable — see feedPost.model.js.
router.patch(
  "/posts/:postId",
  objectIdParam("postId"),
  feedCaptionRules,
  validate,
  feedController.updatePost
);

router.delete("/posts/:postId", objectIdParam("postId"), validate, feedController.deletePost);

// Rate-limited: it is called once per image, so it is the one authenticated
// endpoint a single account can loop on to burn the Cloudinary quota.
router.post("/upload-signature", feedUploadLimiter, feedController.createFeedImageUpload);

/* ---- likes and saves -------------------------------------------------- */

router.post("/posts/:postId/like", objectIdParam("postId"), validate, feedController.toggleLike);

router.get(
  "/posts/:postId/likes",
  objectIdParam("postId"),
  paginationRules,
  validate,
  feedController.listPostLikes
);

router.post("/posts/:postId/save", objectIdParam("postId"), validate, feedController.toggleSave);

/* ---- comments --------------------------------------------------------- */

router.get(
  "/posts/:postId/comments",
  objectIdParam("postId"),
  paginationRules,
  validate,
  feedController.listComments
);

router.post(
  "/posts/:postId/comments",
  objectIdParam("postId"),
  commentRules,
  validate,
  feedController.addComment
);

// MUST precede /comments/:commentId/replies. Express matches in declaration
// order, so with these the other way round "inbox" is read as a commentId and
// objectIdParam 422s on a valid route.
router.get("/comments/inbox", paginationRules, validate, feedController.listCommentInbox);

router.get(
  "/comments/:commentId/replies",
  objectIdParam("commentId"),
  validate,
  feedController.listReplies
);

router.post(
  "/comments/:commentId/like",
  objectIdParam("commentId"),
  validate,
  feedController.toggleCommentLike
);

router.delete(
  "/comments/:commentId",
  objectIdParam("commentId"),
  validate,
  feedController.deleteComment
);

export default router;
