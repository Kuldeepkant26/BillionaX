import mongoose from "mongoose";

/**
 * A guest's comment on a hotel's video.
 *
 * hotelId is denormalised from the parent Content row so a hotel can moderate
 * everything posted on its videos with one indexed query, and so deleting a
 * hotel's content can sweep its comments without a join.
 *
 * Comments are stored as plain text and rendered as text — never as markup.
 * The only sanitising that matters is at the render boundary, and React
 * escapes by default.
 */
const contentCommentSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
      index: true,
    },
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    body: { type: String, required: true, trim: true, maxlength: 600 },

    // One level of threading, and deliberately only one: null for a top-level
    // comment, the id of a top-level comment for a reply. A reply can never
    // itself be replied to, which is what keeps the read path a single query
    // per level instead of a recursive walk, and keeps the UI from indenting
    // off the side of a phone.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContentComment",
      default: null,
    },

    // Soft-delete: a removed comment leaves a tombstone so the reply count and
    // any future threading stay stable. Filtered out of every read path.
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The feed under a video: top-level comments, newest first. parentId is in the
// key because every read path filters on it — the thread asks for parentId:null
// and a reply list asks for one specific parent.
contentCommentSchema.index({ contentId: 1, parentId: 1, isDeleted: 1, createdAt: -1 });

// Replies belonging to a set of parents, for the per-comment reply counts.
contentCommentSchema.index({ parentId: 1, isDeleted: 1, createdAt: 1 });

export const ContentComment = mongoose.model("ContentComment", contentCommentSchema);
