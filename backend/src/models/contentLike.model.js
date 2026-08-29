import mongoose from "mongoose";

/**
 * One row per guest per video they liked.
 *
 * A join row rather than an array on Content: the array would be unbounded on
 * a popular video, and every like would rewrite the whole document. This shape
 * makes a like a single insert and an unlike a single delete.
 *
 * The compound unique index is what makes liking idempotent — a double tap, a
 * retried request or two tabs all collapse to one row instead of inflating the
 * count. Mirrors guestHotelMembership's {guestId, hotelId} guard.
 */
const contentLikeSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

contentLikeSchema.index({ guestId: 1, contentId: 1 }, { unique: true });

export const ContentLike = mongoose.model("ContentLike", contentLikeSchema);
