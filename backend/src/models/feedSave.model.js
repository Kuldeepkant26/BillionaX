import mongoose from "mongoose";

/**
 * One row per user per post they bookmarked.
 *
 * Unlike the like models a save is also LISTED — there is a saved-posts screen —
 * so it needs a sort-bearing index the like models do not.
 *
 * That list sorts by when you SAVED it, not when the post was written, because
 * that is what a bookmark list means: the thing you put there most recently is
 * the thing you are looking for. Hence createdAt on this row is the sort key.
 *
 * Saves are private. Nothing exposes who saved a post, and no count of saves is
 * shown anywhere — so there is deliberately no {postId, ...} index.
 */
const feedSaveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "FeedPost", required: true, index: true },
  },
  { timestamps: true }
);

// The saved-posts screen, served straight from the index.
feedSaveSchema.index({ userId: 1, createdAt: -1 });

// Idempotency, same as every other join row.
feedSaveSchema.index({ userId: 1, postId: 1 }, { unique: true });

export const FeedSave = mongoose.model("FeedSave", feedSaveSchema);
