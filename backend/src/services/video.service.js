import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { CONTENT_KINDS } from "../config/constants.js";
import { Content } from "../models/content.model.js";
import { ContentLike } from "../models/contentLike.model.js";
import { ContentComment } from "../models/contentComment.model.js";

/**
 * The video feed and its interactions.
 *
 * A "video" is any Content or Offer row carrying a videoUrl — there is no
 * separate collection. That keeps one editing surface for hotel staff (the
 * cards they already manage) and means a video is automatically subject to the
 * same isActive and hotel scoping as everything else.
 */

/**
 * A video is its own kind, and must still have something to play.
 *
 * The videoUrl check stays as a guard: a VIDEO row saved without a file would
 * otherwise reach the feed and render an empty player.
 */
const HAS_VIDEO = {
  kind: CONTENT_KINDS.VIDEO,
  videoUrl: { $exists: true, $nin: [null, ""] },
};

/**
 * Like counts and the caller's own like state for a set of videos.
 *
 * Two aggregate queries for the whole page rather than two per row: at 20
 * videos the naive version is 40 round trips, and the counts are the reason
 * the feed felt slow in the first place.
 */
const decorate = async (docs, guestId) => {
  if (!docs.length) return [];

  const ids = docs.map((d) => d._id);

  const [counts, mine, commentCounts] = await Promise.all([
    ContentLike.aggregate([
      { $match: { contentId: { $in: ids } } },
      { $group: { _id: "$contentId", count: { $sum: 1 } } },
    ]),
    ContentLike.find({ contentId: { $in: ids }, guestId }).select("contentId").lean(),
    ContentComment.aggregate([
      { $match: { contentId: { $in: ids }, isDeleted: false } },
      { $group: { _id: "$contentId", count: { $sum: 1 } } },
    ]),
  ]);

  const likeBy = new Map(counts.map((c) => [String(c._id), c.count]));
  const commentBy = new Map(commentCounts.map((c) => [String(c._id), c.count]));
  const likedByMe = new Set(mine.map((m) => String(m.contentId)));

  return docs.map((doc) => {
    const id = String(doc._id);
    return {
      ...doc,
      likeCount: likeBy.get(id) || 0,
      commentCount: commentBy.get(id) || 0,
      likedByMe: likedByMe.has(id),
    };
  });
};

/**
 * Every playable video at one hotel, newest first.
 *
 * Paginated with a `hasMore` flag rather than a total: the guest UI is a
 * "load more" list (see NotificationsPage), and counting the whole collection
 * to render one button is work nobody reads.
 */
export const listVideos = async ({ hotelId, guestId, page = 1, limit = 12 }) => {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 12));
  const safePage = Math.max(1, Number(page) || 1);

  const docs = await Content.find({ hotelId, isActive: true, ...HAS_VIDEO })
    .sort({ sortOrder: 1, createdAt: -1 })
    // One extra row is what tells us whether another page exists, without a
    // second count query.
    .limit(safeLimit + 1)
    .skip((safePage - 1) * safeLimit)
    .lean();

  const hasMore = docs.length > safeLimit;
  const page_ = hasMore ? docs.slice(0, safeLimit) : docs;

  return { items: await decorate(page_, guestId), page: safePage, limit: safeLimit, hasMore };
};

/** One video, plus the rest of that hotel's videos for the up-next rail. */
export const getVideo = async ({ contentId, hotelId, guestId }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  const doc = await Content.findOne({
    _id: contentId,
    hotelId,
    isActive: true,
    ...HAS_VIDEO,
  }).lean();

  if (!doc) throw new ApiError(404, "Video not found");

  const [[video], related] = await Promise.all([
    decorate([doc], guestId),
    Content.find({ hotelId, isActive: true, _id: { $ne: doc._id }, ...HAS_VIDEO })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return { video, related: await decorate(related, guestId) };
};

/**
 * Toggles the caller's like and returns the new state.
 *
 * The count is read back rather than incremented in memory: two devices
 * tapping at once would otherwise both report the same number.
 */
export const toggleLike = async ({ contentId, hotelId, guestId }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  // Scoped by hotel so a guest cannot like a video at a property they are not
  // a member of by posting its id directly.
  const exists = await Content.exists({ _id: contentId, hotelId, isActive: true, ...HAS_VIDEO });
  if (!exists) throw new ApiError(404, "Video not found");

  const removed = await ContentLike.findOneAndDelete({ contentId, guestId });
  if (!removed) {
    try {
      await ContentLike.create({ contentId, guestId });
    } catch (error) {
      // A duplicate means a concurrent request already liked it. That is the
      // desired end state, so treat it as success rather than a 500.
      if (error?.code !== 11000) throw error;
    }
  }

  const [likeCount, likedByMe] = await Promise.all([
    ContentLike.countDocuments({ contentId }),
    ContentLike.exists({ contentId, guestId }),
  ]);

  return { likeCount, likedByMe: Boolean(likedByMe) };
};

export const listComments = async ({ contentId, hotelId, page = 1, limit = 20 }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  const exists = await Content.exists({ _id: contentId, hotelId, isActive: true });
  if (!exists) throw new ApiError(404, "Video not found");

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const docs = await ContentComment.find({ contentId, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(safeLimit + 1)
    .skip((safePage - 1) * safeLimit)
    .populate("guestId", "name avatarUrl")
    .lean();

  const hasMore = docs.length > safeLimit;
  const items = (hasMore ? docs.slice(0, safeLimit) : docs).map((c) => ({
    id: String(c._id),
    body: c.body,
    createdAt: c.createdAt,
    // Flattened here so the client never has to know the comment is a join,
    // and so a deleted account degrades to "Guest" instead of a crash.
    author: {
      id: c.guestId ? String(c.guestId._id) : null,
      name: c.guestId?.name || "Guest",
      avatarUrl: c.guestId?.avatarUrl || null,
    },
  }));

  return { items, page: safePage, limit: safeLimit, hasMore };
};

export const addComment = async ({ contentId, hotelId, guestId, body }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  const content = await Content.findOne({ _id: contentId, hotelId, isActive: true, ...HAS_VIDEO })
    .select("_id hotelId")
    .lean();
  if (!content) throw new ApiError(404, "Video not found");

  const text = String(body || "").trim();
  if (!text) throw new ApiError(400, "Write something first", [
    { field: "body", message: "Write something first" },
  ]);

  const created = await ContentComment.create({
    contentId,
    hotelId: content.hotelId,
    guestId,
    body: text,
  });

  const populated = await ContentComment.findById(created._id)
    .populate("guestId", "name avatarUrl")
    .lean();

  return {
    id: String(populated._id),
    body: populated.body,
    createdAt: populated.createdAt,
    author: {
      id: String(populated.guestId._id),
      name: populated.guestId?.name || "Guest",
      avatarUrl: populated.guestId?.avatarUrl || null,
    },
  };
};

/** A guest may remove their OWN comment; the filter is the authorisation. */
export const deleteComment = async ({ commentId, guestId }) => {
  if (!mongoose.isValidObjectId(commentId)) throw new ApiError(404, "Comment not found");

  const updated = await ContentComment.findOneAndUpdate(
    { _id: commentId, guestId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );

  if (!updated) throw new ApiError(404, "Comment not found");
  return true;
};
