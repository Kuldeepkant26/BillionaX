import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";
import { User } from "../models/user.model.js";
import { FeedPost } from "../models/feedPost.model.js";
import { FeedPostLike } from "../models/feedPostLike.model.js";
import { FeedComment } from "../models/feedComment.model.js";
import { FeedCommentLike } from "../models/feedCommentLike.model.js";
import { FeedSave } from "../models/feedSave.model.js";

/**
 * The global feed.
 *
 * THIS IS THE ONE SERVICE IN THE APP THAT IS NOT HOTEL-SCOPED, and that is a
 * product decision rather than an oversight. Everywhere else a guest read is
 * gated on membership and filtered by hotelId; here every authenticated user
 * sees every post on the network.
 *
 * Because feed.routes.js therefore cannot use requireSameHotel — the middleware
 * that elsewhere makes a forgotten route safe by default — one rule takes its
 * place and must not be broken:
 *
 *   NO FUNCTION IN THIS FILE EVER TAKES A HOTEL FILTER FROM CLIENT INPUT.
 *
 * The hotel-scoped reads below (listHotelPosts) derive their hotelId from the
 * authenticated user's own record, never from a param or a query string. If you
 * add an endpoint here, that is the invariant to preserve.
 *
 * Most of the interaction machinery is lifted from video.service.js, which
 * solved the same problems first: batched decoration instead of per-row counts,
 * idempotent toggles that swallow duplicate-key errors, one level of reply
 * threading, and tombstones that sweep their children.
 */

/** Roles whose posts and comments wear the verified tick. */
const VERIFIED_ROLES = new Set([ROLES.HOTEL_ADMIN, ROLES.MAIN_ADMIN]);

/**
 * The tick, from a field already on the row.
 *
 * authorRole is denormalised at write time precisely so this costs no query —
 * see feedPost.model.js for why it is frozen at write time and what to do if
 * that ever stops being acceptable.
 */
const isVerified = (role) => VERIFIED_ROLES.has(role);

/** The author block every post and comment carries, flattened for the client. */
const shapeAuthor = (user, authorRole) => ({
  id: user?._id ? String(user._id) : null,
  // A deleted account degrades to "Guest" rather than crashing the row, the
  // same fallback decorateComments uses.
  name: user?.name || "Guest",
  avatarUrl: user?.avatarUrl || null,
  // Read from the denormalised role on the ROW, not from the populated user:
  // the tick describes who wrote it, not who they are today.
  isVerified: isVerified(authorRole),
});

/** The fields of an author the feed ever renders. */
const AUTHOR_FIELDS = "name avatarUrl role hotelId";

/**
 * Attaches the caller's own like and save state to a page of posts.
 *
 * Two queries for the whole page, not two per row. Counts are NOT queried here
 * at all — likeCount and commentCount are materialised on the post (see
 * feedPost.model.js), which is what keeps this to a flat four queries per page:
 * the find, its populate, and these two.
 *
 * Only per-viewer state remains, because that is the one thing that cannot be
 * materialised onto a row shared by everybody.
 */
const decorate = async (docs, userId) => {
  if (!docs.length) return [];

  const ids = docs.map((d) => d._id);

  const [myLikes, mySaves] = await Promise.all([
    FeedPostLike.find({ postId: { $in: ids }, userId }).select("postId").lean(),
    FeedSave.find({ postId: { $in: ids }, userId }).select("postId").lean(),
  ]);

  const likedByMe = new Set(myLikes.map((r) => String(r.postId)));
  const savedByMe = new Set(mySaves.map((r) => String(r.postId)));

  return docs.map((doc) => {
    const id = String(doc._id);
    return {
      id,
      images: doc.images || [],
      caption: doc.caption || "",
      createdAt: doc.createdAt,
      likeCount: Math.max(0, doc.likeCount || 0),
      commentCount: Math.max(0, doc.commentCount || 0),
      likedByMe: likedByMe.has(id),
      savedByMe: savedByMe.has(id),
      author: shapeAuthor(doc.authorId, doc.authorRole),
    };
  });
};

/**
 * One page of the global feed, newest first.
 *
 * CURSOR-PAGINATED, and the only cursor in the codebase. The reason is
 * correctness, not speed: this feed is sorted purely by createdAt and new posts
 * arrive at the head constantly, so a skip-based page 2 lands wherever the head
 * has pushed it. A reader who loads twelve posts, has three more published, and
 * taps "load more" sees three rows a second time.
 *
 * A cursor is an absolute position in the ordering, so new posts at the head
 * are invisible to a scroll already in progress — which is both correct and
 * what a reader expects. Index {isDeleted: 1, createdAt: -1} serves the filter
 * and the sort together, so this is a seek rather than a walk.
 *
 * KNOWN GAP: two posts written in the same millisecond could straddle a page
 * boundary and drop one. The fix is a compound {createdAt, _id} cursor, sorting
 * on both and filtering with an $or. It is deliberately not done here — it
 * needs the index extended and doubles the cursor parsing, for a collision this
 * app's write volume makes negligible. This comment is the escape hatch.
 */
export const listFeed = async ({ userId, cursor, limit = 12 }) => {
  const safeLimit = Math.min(30, Math.max(1, Number(limit) || 12));

  const filter = { isDeleted: false };
  if (cursor) {
    const at = new Date(cursor);
    // An unparseable cursor is a client bug. Serving page 1 instead would look
    // to the reader like the feed silently resetting itself mid-scroll.
    if (Number.isNaN(at.getTime())) {
      throw new ApiError(400, "Invalid cursor", [{ field: "cursor", message: "Invalid cursor" }]);
    }
    filter.createdAt = { $lt: at };
  }

  const docs = await FeedPost.find(filter)
    .sort({ createdAt: -1 })
    // One extra row tells us whether another page exists, with no count query —
    // the same trick listVideos uses, just with a seek instead of a skip.
    .limit(safeLimit + 1)
    .populate("authorId", AUTHOR_FIELDS)
    .lean();

  const hasMore = docs.length > safeLimit;
  const page = hasMore ? docs.slice(0, safeLimit) : docs;

  return {
    items: await decorate(page, userId),
    // Null at the end, so the client has an unambiguous stop condition rather
    // than inferring one from an empty page.
    nextCursor: hasMore && page.length ? page[page.length - 1].createdAt.toISOString() : null,
    hasMore,
  };
};

/** One post by id — the deep-link and share target, and the panel's drill-down. */
export const getPost = async ({ postId, userId }) => {
  if (!mongoose.isValidObjectId(postId)) throw new ApiError(404, "Post not found");

  const doc = await FeedPost.findOne({ _id: postId, isDeleted: false })
    .populate("authorId", AUTHOR_FIELDS)
    .lean();

  if (!doc) throw new ApiError(404, "Post not found");

  const [post] = await decorate([doc], userId);
  return { post };
};

/**
 * One user's posts, for the profile grid.
 *
 * Page-based rather than cursor-based, unlike the global feed: a profile is a
 * grid the reader scans rather than an endless scroll, and one person's posting
 * rate is nowhere near fast enough to shift a page under them.
 */
export const listUserPosts = async ({ targetUserId, userId, page = 1, limit = 18 }) => {
  if (!mongoose.isValidObjectId(targetUserId)) throw new ApiError(404, "Profile not found");

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 18));
  const safePage = Math.max(1, Number(page) || 1);

  const author = await User.findById(targetUserId).select(AUTHOR_FIELDS).lean();
  if (!author) throw new ApiError(404, "Profile not found");

  const docs = await FeedPost.find({ authorId: targetUserId, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(safeLimit + 1)
    .skip((safePage - 1) * safeLimit)
    .populate("authorId", AUTHOR_FIELDS)
    .lean();

  const hasMore = docs.length > safeLimit;
  const items = await decorate(hasMore ? docs.slice(0, safeLimit) : docs, userId);

  return {
    items,
    // The profile header. isVerified comes from the user's CURRENT role here,
    // not a frozen copy — this describes who they are now, which is the right
    // reading for a profile even though a post's tick is historical.
    author: {
      id: String(author._id),
      name: author.name || "Guest",
      avatarUrl: author.avatarUrl || null,
      isVerified: isVerified(author.role),
    },
    page: safePage,
    limit: safeLimit,
    hasMore,
  };
};
