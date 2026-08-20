import mongoose from "mongoose";
import { NOTIFICATION_KIND_VALUES } from "../config/constants.js";

/**
 * Notices that have NO CoinTransaction behind them.
 *
 * Coin activity is deliberately not stored here: the ledger already is that
 * feed, keyed {guestId, createdAt:-1}, and reconcile.js already guarantees it
 * is complete. Duplicating it would double every coin write and create a
 * second source of truth with no integrity check. See notification.service.js
 * for how the two sources are merged.
 */
const notificationSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", default: null },

    kind: { type: String, enum: NOTIFICATION_KIND_VALUES, required: true },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    body: { type: String, trim: true, maxlength: 400 },

    /** Where tapping the notification should land the guest, e.g. "/app/redeem". */
    href: { type: String, trim: true },

    /** Render context: tier name, voucher code, coin count. */
    meta: { type: mongoose.Schema.Types.Mixed },

    /** Blocks duplicates from a retried emit. Same pattern as CoinTransaction. */
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ guestId: 1, createdAt: -1 });
notificationSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } }
);

// Notices are disposable context, unlike the ledger, which is permanent.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export const Notification = mongoose.model("Notification", notificationSchema);
