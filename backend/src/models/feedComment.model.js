import mongoose from "mongoose";
import { ROLE_VALUES } from "../config/constants.js";

/**
 * A comment on a feed post.
 *
 * Structurally the same as ContentComment, with the hotel coupling removed —
 * that model's hotelId is required and is its moderation key, and a global feed
 * has no hotel to scope by. postAuthorId takes over that job; see below.
 *
 * Comments are stored as plain text and rendered as text — never as markup.
 * The only sanitising that matters is at the render boundary, and React
 * escapes by default.
 */
const feedCommentSchema = new mongoose.Schema(
  {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: "FeedPost", required: true, index: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // Copied at write time, same as on the post — this is the blue tick, and it
    // is frozen at write time for the same reason. See feedPost.model.js.
    authorRole: { type: String, enum: ROLE_VALUES, required: true },

    /**
     * Who wrote the POST this comment sits on, denormalised at write time.
     *
     * This is the moderation key, and the reason it exists is worth stating:
     * "the author of a post may remove comments on it" has to be expressible as
     * a FILTER, so the check and the write are one atomic operation. That is the
     * discipline video.service.js's deleteCommentAsHotel follows with its
     * hotelId filter — the filter IS the authorisation, with no read-then-check
     * race in between.
     *
     * Without this field that rule would be a second query plus a comparison,
     * and a TOCTOU window. It also serves the panel's "comments on my posts"
     * inbox with one indexed read.
     */
    postAuthorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 600 matches commentRules in common.validator.js exactly, so that existing
    // validator chain is reusable here verbatim.
    body: { type: String, required: true, trim: true, maxlength: 600 },

    // One level of threading, and deliberately only one: null for a top-level
    // comment, the id of a top-level comment for a reply. A reply can never
    // itself be replied to, which is what keeps the read path a single query
    // per level instead of a recursive walk, and keeps the UI from indenting
    // off the side of a phone. Enforced in feed.service.js.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FeedComment",
      default: null,
    },

    // Soft-delete: a removed comment leaves a tombstone so reply counts and any
    // future threading stay stable. Filtered out of every read path.
    isDeleted: { type: Boolean, default: false },

    // Materialised for the same reason as the post's counters — see
    // feedPost.model.js — and reconciled by the same script.
    likeCount: { type: Number, default: 0, min: 0 },
    replyCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// The thread under a post: top-level comments, newest first. parentId is in the
// key because every read path filters on it — the thread asks for parentId:null
// and a reply list asks for one specific parent.
feedCommentSchema.index({ postId: 1, parentId: 1, isDeleted: 1, createdAt: -1 });

// Replies belonging to a set of parents, for the per-comment reply counts.
feedCommentSchema.index({ parentId: 1, isDeleted: 1, createdAt: 1 });

// "Comments on posts I wrote" — the panel's reply inbox, in one indexed read.
feedCommentSchema.index({ postAuthorId: 1, isDeleted: 1, createdAt: -1 });

export const FeedComment = mongoose.model("FeedComment", feedCommentSchema);
