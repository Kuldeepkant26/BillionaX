import mongoose from "mongoose";
import { ROLE_VALUES } from "../config/constants.js";

/** Rejects javascript: and data: URLs, which would be an XSS vector in <img src>. */
const isSafeUrl = (value) => {
  if (!value) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * A post in the global feed.
 *
 * Unlike Content — which is a hotel's marketing material and is hotel-scoped in
 * every read path — a feed post belongs to a PERSON and is visible network-wide.
 * That is why it is its own collection rather than another CONTENT_KIND:
 * Content.hotelId is required, and a guest's post has no hotel.
 *
 * DELETION IS SOFT here, unlike content.service.js which hard-deletes. A post
 * owns like, comment and save rows in four other collections; removing the
 * document would leave every one of them pointing at nothing, and a count query
 * would still find them. The tombstone keeps those rows meaningful and is
 * filtered out of every read path. Its images are destroyed immediately even so
 * — see deletePost.
 */
const feedPostSchema = new mongoose.Schema(
  {
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    /**
     * The author's role, copied at write time. This is the blue tick.
     *
     * Denormalised so decorate() can derive the tick from the row it already
     * has, instead of joining User on every read of the app's busiest screen.
     *
     * The consequence is that the tick is FROZEN at write time: an admin who is
     * later demoted keeps the tick on their old posts. That is the correct
     * reading — the tick asserts "this was written by a hotel admin", which
     * stays true. If live demotion is ever needed, the fix is a one-off
     * updateMany({ authorId }, { authorRole }) wherever the role changes, NOT a
     * per-read join, which would undo the whole point of this field.
     */
    authorRole: { type: String, enum: ROLE_VALUES, required: true },

    /**
     * The author's hotel, copied at write time. Null for GUEST and MAIN_ADMIN.
     *
     * Lets the hotel panel list "everything my property posted" and the admin
     * panel filter moderation by hotel, both without a $lookup.
     */
    authorHotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hotel",
      default: null,
    },

    /**
     * One to ten Cloudinary image URLs, in display order.
     *
     * This is the SCHEMA gate, and it is not the only one: feed.service.js runs
     * assertOwnImages, which additionally requires every URL to be on our own
     * Cloudinary account. This layer exists so a script or a future admin tool
     * writing directly to the model still cannot store a javascript: URL.
     *
     * Images are IMMUTABLE once posted — a post is caption-editable only. That
     * is deliberate: replacing an image means comparing the old and new assets
     * to decide what to destroy, and comparing URLs rather than public_ids is
     * exactly what once deleted a live avatar (see content.service.js's
     * replaceAsset). With no edit path there is nothing to compare.
     */
    images: {
      type: [String],
      required: true,
      validate: [
        {
          validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 10,
          message: "A post needs between 1 and 10 images",
        },
        {
          validator: (v) => v.every(isSafeUrl),
          message: "Image URLs must be http(s) links",
        },
      ],
    },

    // Plain text, rendered as text — never as markup. The only sanitising that
    // matters is at the render boundary, and React escapes by default. 2200 is
    // Instagram's own cap and is far past where anyone reads.
    caption: { type: String, trim: true, maxlength: 2200, default: "" },

    isDeleted: { type: Boolean, default: false },
    // Moderation audit: one field that answers "did the author remove this, or
    // did an admin?" for as long as the tombstone lives.
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },

    /**
     * Materialised counters, maintained with $inc.
     *
     * A deliberate divergence from video.service.js, which counts with a $in
     * aggregate per page. At one hotel's scale that is nothing; on a global
     * feed reading an unbounded like collection it is the wrong shape for the
     * screen the whole app opens on.
     *
     * The join rows remain the source of truth for idempotency — the unique
     * index on FeedPostLike is what makes a double tap a no-op, and the $inc
     * rides on whether that insert succeeded. They can still drift if a process
     * dies between the insert and the $inc, which is why scripts/recountFeed.js
     * exists and is not optional.
     */
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// THE feed query: global, newest first, tombstones excluded. Exact-match on
// isDeleted then a range on createdAt, which Mongo serves as a pure index scan
// with the sort already satisfied — that property is what makes the createdAt
// cursor in feed.service.js an index seek rather than a walk.
feedPostSchema.index({ isDeleted: 1, createdAt: -1 });

// One author's posts: the profile grid, and the panel's "my posts" tab.
feedPostSchema.index({ authorId: 1, isDeleted: 1, createdAt: -1 });

// Everything one property posted (admin and staff together), and the admin
// panel's per-hotel moderation filter.
//
// Partial so guest-authored rows — which have authorHotelId: null and are the
// vast majority of the collection — never enter it. Dropping this filter "to
// simplify" roughly doubles the index for zero additional queries.
feedPostSchema.index(
  { authorHotelId: 1, isDeleted: 1, createdAt: -1 },
  { partialFilterExpression: { authorHotelId: { $type: "objectId" } } }
);

// The asset-sweep script's only query, partial for the same reason as
// content.model.js's validTo index: almost no row is deleted, so indexing the
// nulls would be most of the collection for a job that reads a handful.
feedPostSchema.index(
  { deletedAt: 1 },
  { partialFilterExpression: { deletedAt: { $type: "date" } } }
);

export const FeedPost = mongoose.model("FeedPost", feedPostSchema);
