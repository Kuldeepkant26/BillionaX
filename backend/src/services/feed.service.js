import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";
import { User } from "../models/user.model.js";
import { FeedPost } from "../models/feedPost.model.js";
import { FeedPostLike } from "../models/feedPostLike.model.js";
import { FeedComment } from "../models/feedComment.model.js";
import { FeedCommentLike } from "../models/feedCommentLike.model.js";
import { FeedSave } from "../models/feedSave.model.js";
import {
  destroyAsset,
  isOwnCloudinaryUrl,
  publicIdFromUrl,
  resourceTypeFromUrl,
} from "./upload.service.js";

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

/* ---- writing -------------------------------------------------------- */

/**
 * Refuses any image that is not on our own Cloudinary account.
 *
 * Uploads happen in the BROWSER, so the URLs we are asked to store are
 * client-supplied — this is the gate that stops a post pointing at an arbitrary
 * host that then gets fetched by every viewer on the network.
 *
 * Lifted from content.service.js's assertOwnImage, with one difference: it
 * reports WHICH image failed. With ten of them "that image could not be
 * verified" tells the composer nothing it can act on.
 */
const assertOwnImages = (images) => {
  const list = Array.isArray(images) ? images : [];

  if (list.length < 1 || list.length > 10) {
    throw new ApiError(400, "Add between 1 and 10 images", [
      { field: "images", message: "Add between 1 and 10 images" },
    ]);
  }

  list.forEach((url, i) => {
    if (!isOwnCloudinaryUrl(url)) {
      throw new ApiError(400, "One of those images could not be verified", [
        { field: `images[${i}]`, message: "Unrecognised image source" },
      ]);
    }
  });

  // Rejected rather than silently de-duplicated: the same URL twice is always a
  // client bug (a double-add), and the delete sweep would otherwise try to
  // destroy one public_id twice.
  if (new Set(list).size !== list.length) {
    throw new ApiError(400, "That post has the same image twice", [
      { field: "images", message: "Remove the duplicate" },
    ]);
  }
};

/**
 * Best-effort removal of every image on a post.
 *
 * An orphaned file is cheaper than a delete that refuses to complete, so this
 * never throws. Scoped by resource type because destroy on the wrong pipeline
 * reports "not found" and quietly leaves the file behind.
 *
 * Note there is no replaceAsset equivalent here, and that is deliberate: a
 * post's images are immutable (only its caption can be edited), so there is
 * never an old asset to compare against a new one. That comparison — public_ids
 * rather than URLs — is the subtle part of content.service.js, and not having
 * an edit path means not having to get it right.
 */
const removeAssets = (images = []) => {
  for (const url of images) {
    const publicId = publicIdFromUrl(url);
    if (publicId) destroyAsset(publicId, resourceTypeFromUrl(url)).catch(() => {});
  }
};

/**
 * Publishes a post.
 *
 * authorRole and authorHotelId are copied from the actor at write time — see
 * feedPost.model.js for why the tick is stored rather than joined.
 */
export const createPost = async ({ actor, images, caption = "" }) => {
  assertOwnImages(images);

  const created = await FeedPost.create({
    authorId: actor._id,
    authorRole: actor.role,
    authorHotelId: actor.hotelId || null,
    images,
    caption: String(caption || "").trim(),
  });

  const doc = await FeedPost.findById(created._id).populate("authorId", AUTHOR_FIELDS).lean();
  const [post] = await decorate([doc], actor._id);

  return { post };
};

/**
 * Edits a caption. The author only, and the caption only.
 *
 * The filter is the authorisation — the same discipline as the deletes below,
 * so there is no window between checking who owns the post and writing to it.
 */
export const updateCaption = async ({ postId, actor, caption }) => {
  if (!mongoose.isValidObjectId(postId)) throw new ApiError(404, "Post not found");

  const updated = await FeedPost.findOneAndUpdate(
    { _id: postId, authorId: actor._id, isDeleted: false },
    { $set: { caption: String(caption || "").trim() } },
    { new: true }
  )
    .populate("authorId", AUTHOR_FIELDS)
    .lean();

  // A post that exists but belongs to someone else is reported as missing
  // rather than forbidden: the caller has no business knowing it is there.
  if (!updated) throw new ApiError(404, "Post not found");

  const [post] = await decorate([updated], actor._id);
  return { post };
};

/**
 * Removes a post: its author, or the platform admin.
 *
 * Written as two filtered branches rather than one read-then-check. The filter
 * IS the authorisation, so there is no window in which the row could change
 * between the check and the write — the discipline video.service.js follows.
 *
 * MAIN_ADMIN takes its own unfiltered branch rather than being folded into the
 * author filter with an $or, so that deletedBy records who actually did it and
 * an admin's removal stays distinguishable from an author's in the audit.
 */
export const deletePost = async ({ postId, actor }) => {
  if (!mongoose.isValidObjectId(postId)) throw new ApiError(404, "Post not found");

  const filter =
    actor.role === ROLES.MAIN_ADMIN
      ? { _id: postId, isDeleted: false }
      : { _id: postId, authorId: actor._id, isDeleted: false };

  const removed = await FeedPost.findOneAndUpdate(
    filter,
    { $set: { isDeleted: true, deletedBy: actor._id, deletedAt: new Date() } },
    { new: true }
  ).lean();

  if (!removed) throw new ApiError(404, "Post not found");

  // Destroyed now rather than on a nightly sweep: a deleted post's photographs
  // staying live on a public CDN URL is precisely the thing being deleted.
  // deletedAt and its partial index exist so scripts/sweepFeedAssets.js can
  // catch the ones this best-effort call failed to remove.
  removeAssets(removed.images);

  // Comments go with the post, the same way deleting a comment sweeps its
  // replies — leaving them would render a thread hanging off nothing.
  await FeedComment.updateMany({ postId, isDeleted: false }, { $set: { isDeleted: true } });

  return { removed: true };
};
