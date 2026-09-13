import mongoose from "mongoose";

/**
 * One row per user per feed comment they liked.
 *
 * Same shape and same reasoning as feedPostLike — the compound unique index
 * makes the like idempotent and drives the $inc on FeedComment.likeCount.
 *
 * No {commentId, createdAt} index here, unlike feedPostLike: there is no "who
 * liked this comment" screen. Add one when that screen exists, not before.
 */
const feedCommentLikeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeedComment",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

feedCommentLikeSchema.index({ userId: 1, commentId: 1 }, { unique: true });

export const FeedCommentLike = mongoose.model("FeedCommentLike", feedCommentLikeSchema);
