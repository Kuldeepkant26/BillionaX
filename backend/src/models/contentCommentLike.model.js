import mongoose from "mongoose";

/**
 * One row per guest per comment they liked.
 *
 * The same join-row shape as contentLike, for the same reasons: an array on the
 * comment would be unbounded and would rewrite the whole document on every tap.
 * The compound unique index is what makes liking idempotent, so a double tap or
 * two tabs collapse to one row instead of inflating the count.
 */
const contentCommentLikeSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContentComment",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

contentCommentLikeSchema.index({ guestId: 1, commentId: 1 }, { unique: true });

export const ContentCommentLike = mongoose.model(
  "ContentCommentLike",
  contentCommentLikeSchema
);
