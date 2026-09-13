import { Router } from "express";
import * as feedController from "../controllers/feed.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { objectIdParam, paginationRules } from "../validators/common.validator.js";

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

router.get("/posts/:postId", objectIdParam("postId"), validate, feedController.getPost);

router.get(
  "/users/:userId/posts",
  objectIdParam("userId"),
  paginationRules,
  validate,
  feedController.listUserPosts
);

export default router;
