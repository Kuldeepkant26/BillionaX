import mongoose from "mongoose";

/**
 * One row per user per post they liked.
 *
 * A join row rather than an array on FeedPost, for the reason contentLike gives:
 * the array would be unbounded on a popular post, and every like would rewrite
 * the whole document.
 *
 * The compound unique index is what makes liking idempotent — a double tap, a
 * retried request or two tabs all collapse to one row. On this model that index
 * does a second job: FeedPost.likeCount is materialised, and the $inc is driven
 * by whether the insert here succeeded or raised a duplicate. The unique index
 * IS the deduplication primitive the counter rides on.
 *
 * `userId`, not `guestId` as on ContentLike: anyone may like a feed post,
 * including a hotel admin and the main admin, neither of whom is a guest.
 */
const feedPostLikeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "FeedPost", required: true, index: true },
  },
  { timestamps: true }
);

feedPostLikeSchema.index({ userId: 1, postId: 1 }, { unique: true });

// "Who liked this post", newest first — the panel's likes drill-down. ContentLike
// has no equivalent because videos have no such screen; without this the list is
// a collection scan.
feedPostLikeSchema.index({ postId: 1, createdAt: -1 });

export const FeedPostLike = mongoose.model("FeedPostLike", feedPostLikeSchema);
