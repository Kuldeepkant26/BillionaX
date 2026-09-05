import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { CONTENT_KINDS, ROLES } from "../config/constants.js";
import { Content } from "../models/content.model.js";
import { ContentLike } from "../models/contentLike.model.js";
import { ContentComment } from "../models/contentComment.model.js";
import { ContentCommentLike } from "../models/contentCommentLike.model.js";

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
    // Counts replies too: the number beside the comment icon is "how much
    // conversation is on this video", which is what a guest expects it to mean.
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

/** Roles that speak for the hotel itself on a comment thread. */
const HOST_ROLES = new Set([ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF]);

/**
 * Shapes raw comment documents for the client, attaching like and reply counts.
 *
 * Batched the same way `decorate` handles videos: two aggregates for the whole
 * page rather than two queries per row, because a 20-comment thread would
 * otherwise be 40 round trips.
 */
const decorateComments = async (docs, guestId) => {
  if (!docs.length) return [];

  const ids = docs.map((d) => d._id);

  const [likeCounts, myLikes, replyCounts] = await Promise.all([
    ContentCommentLike.aggregate([
      { $match: { commentId: { $in: ids } } },
      { $group: { _id: "$commentId", count: { $sum: 1 } } },
    ]),
    ContentCommentLike.find({ commentId: { $in: ids }, guestId }).select("commentId").lean(),
    ContentComment.aggregate([
      { $match: { parentId: { $in: ids }, isDeleted: false } },
      { $group: { _id: "$parentId", count: { $sum: 1 } } },
    ]),
  ]);

  const likeBy = new Map(likeCounts.map((r) => [String(r._id), r.count]));
  const replyBy = new Map(replyCounts.map((r) => [String(r._id), r.count]));
  const likedByMe = new Set(myLikes.map((r) => String(r.commentId)));

  return docs.map((c) => {
    const id = String(c._id);
    return {
      id,
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId ? String(c.parentId) : null,
      likeCount: likeBy.get(id) || 0,
      likedByMe: likedByMe.has(id),
      replyCount: replyBy.get(id) || 0,
      // Flattened here so the client never has to know the comment is a join,
      // and so a deleted account degrades to "Guest" instead of a crash.
      author: {
        id: c.guestId ? String(c.guestId._id) : null,
        name: c.guestId?.name || "Guest",
        avatarUrl: c.guestId?.avatarUrl || null,
        // Staff of THIS hotel, so the row can wear the hotel's logo and a
        // "Host" tag. Compared against the comment's own hotelId rather than
        // trusting the role alone: an admin at another property is an
        // ordinary guest here.
        isHost:
          HOST_ROLES.has(c.guestId?.role) &&
          String(c.guestId?.hotelId || "") === String(c.hotelId || ""),
      },
    };
  });
};

/**
 * One page of TOP-LEVEL comments on a video, newest first.
 *
 * Replies are excluded (parentId: null) and fetched per-comment on demand: a
 * thread where one comment has forty replies should not make the first page of
 * the other comments wait, and most replies are never expanded.
 */
export const listComments = async ({ contentId, hotelId, guestId, page = 1, limit = 20 }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  const exists = await Content.exists({ _id: contentId, hotelId, isActive: true });
  if (!exists) throw new ApiError(404, "Video not found");

  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const docs = await ContentComment.find({ contentId, parentId: null, isDeleted: false })
    .sort({ createdAt: -1 })
    .limit(safeLimit + 1)
    .skip((safePage - 1) * safeLimit)
    .populate("guestId", "name avatarUrl role hotelId")
    .lean();

  const hasMore = docs.length > safeLimit;
  const items = await decorateComments(hasMore ? docs.slice(0, safeLimit) : docs, guestId);

  return { items, page: safePage, limit: safeLimit, hasMore };
};

/**
 * Every reply under one comment, OLDEST first.
 *
 * Ascending because a reply thread reads as a conversation, unlike the
 * top-level feed where the newest comment is the interesting one. Not
 * paginated: one level of threading keeps these short, and a guest who opened
 * them asked to see them.
 */
export const listReplies = async ({ commentId, hotelId, guestId }) => {
  if (!mongoose.isValidObjectId(commentId)) throw new ApiError(404, "Comment not found");

  // Scoped by hotel so a guest cannot read a thread at a property they are not
  // a member of by posting its id directly.
  const parent = await ContentComment.exists({ _id: commentId, hotelId });
  if (!parent) throw new ApiError(404, "Comment not found");

  const docs = await ContentComment.find({ parentId: commentId, isDeleted: false })
    .sort({ createdAt: 1 })
    .populate("guestId", "name avatarUrl role hotelId")
    .lean();

  return { items: await decorateComments(docs, guestId) };
};

/**
 * Posts a comment, or a reply when parentId is given.
 *
 * A reply to a reply is rejected rather than silently flattened: the caller
 * would otherwise get back a comment whose parent is not the one it named.
 */
export const addComment = async ({ contentId, hotelId, guestId, body, parentId = null }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  const content = await Content.findOne({ _id: contentId, hotelId, isActive: true, ...HAS_VIDEO })
    .select("_id hotelId")
    .lean();
  if (!content) throw new ApiError(404, "Video not found");

  let parent = null;
  if (parentId) {
    if (!mongoose.isValidObjectId(parentId)) throw new ApiError(404, "Comment not found");
    parent = await ContentComment.findOne({ _id: parentId, contentId, isDeleted: false })
      .select("_id parentId")
      .lean();
    if (!parent) throw new ApiError(404, "Comment not found");
    // One level only.
    if (parent.parentId) throw new ApiError(400, "You cannot reply to a reply");
  }

  const text = String(body || "").trim();
  if (!text) throw new ApiError(400, "Write something first", [
    { field: "body", message: "Write something first" },
  ]);

  const created = await ContentComment.create({
    contentId,
    hotelId: content.hotelId,
    guestId,
    body: text,
    parentId: parent ? parent._id : null,
  });

  const populated = await ContentComment.findById(created._id)
    .populate("guestId", "name avatarUrl role hotelId")
    .lean();

  const [shaped] = await decorateComments([populated], guestId);
  return shaped;
};

/**
 * Toggles the caller's like on a comment and returns the new state.
 *
 * Mirrors toggleLike on a video, including reading the count back rather than
 * adjusting it in memory.
 */
export const toggleCommentLike = async ({ commentId, hotelId, guestId }) => {
  if (!mongoose.isValidObjectId(commentId)) throw new ApiError(404, "Comment not found");

  const exists = await ContentComment.exists({ _id: commentId, hotelId, isDeleted: false });
  if (!exists) throw new ApiError(404, "Comment not found");

  const removed = await ContentCommentLike.findOneAndDelete({ commentId, guestId });
  if (!removed) {
    try {
      await ContentCommentLike.create({ commentId, guestId });
    } catch (error) {
      // A duplicate means a concurrent request already liked it. That is the
      // desired end state, so treat it as success rather than a 500.
      if (error?.code !== 11000) throw error;
    }
  }

  const [likeCount, likedByMe] = await Promise.all([
    ContentCommentLike.countDocuments({ commentId }),
    ContentCommentLike.exists({ commentId, guestId }),
  ]);

  return { likeCount, likedByMe: Boolean(likedByMe) };
};

/**
 * A hotel's view of one of its videos' comments, for the panel.
 *
 * The whole thread — top-level comments each carrying their replies — because
 * a moderator reads a conversation, not a page of roots. Ordered oldest-first
 * inside a thread for the same reason.
 *
 * Scoped to the hotel by the query itself, so staff at one property can never
 * read another's threads by passing an id.
 */
export const listCommentsForHotel = async ({ contentId, hotelId }) => {
  if (!mongoose.isValidObjectId(contentId)) throw new ApiError(404, "Video not found");

  const exists = await Content.exists({ _id: contentId, hotelId });
  if (!exists) throw new ApiError(404, "Video not found");

  const docs = await ContentComment.find({ contentId, hotelId, isDeleted: false })
    .sort({ createdAt: -1 })
    .populate("guestId", "name avatarUrl role hotelId")
    .lean();

  const shaped = await decorateComments(docs, null);

  // Rebuilt into threads here rather than with a second query per parent.
  const byId = new Map(shaped.map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const c of shaped) {
    const node = byId.get(c.id);
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId).replies.push(node);
    else if (!c.parentId) roots.push(node);
  }
  // Replies read as a conversation: oldest first, unlike the roots.
  for (const r of roots) r.replies.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return { items: roots, total: shaped.length };
};

/**
 * A hotel removes a comment on its OWN video — the hotelId is the
 * authorisation, the mirror of the guest's guestId filter.
 */
export const deleteCommentAsHotel = async ({ commentId, hotelId }) => {
  if (!mongoose.isValidObjectId(commentId)) throw new ApiError(404, "Comment not found");

  const updated = await ContentComment.findOneAndUpdate(
    { _id: commentId, hotelId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );
  if (!updated) throw new ApiError(404, "Comment not found");

  let removedReplies = 0;
  if (!updated.parentId) {
    const swept = await ContentComment.updateMany(
      { parentId: updated._id, isDeleted: false },
      { isDeleted: true }
    );
    removedReplies = swept.modifiedCount || 0;
  }

  return { removed: 1 + removedReplies };
};

/**
 * A guest may remove their OWN comment; the filter is the authorisation.
 *
 * Removing a top-level comment tombstones its replies with it — leaving them
 * behind would render them as a thread hanging off a comment that is gone.
 * Returns how many rows went, so the caller can correct the video's count
 * without a re-fetch.
 */
export const deleteComment = async ({ commentId, guestId }) => {
  if (!mongoose.isValidObjectId(commentId)) throw new ApiError(404, "Comment not found");

  const updated = await ContentComment.findOneAndUpdate(
    { _id: commentId, guestId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );

  if (!updated) throw new ApiError(404, "Comment not found");

  // Only a top-level comment can own replies, so this is a no-op for a reply.
  let removedReplies = 0;
  if (!updated.parentId) {
    const swept = await ContentComment.updateMany(
      { parentId: updated._id, isDeleted: false },
      { isDeleted: true }
    );
    removedReplies = swept.modifiedCount || 0;
  }

  return { removed: 1 + removedReplies };
};
