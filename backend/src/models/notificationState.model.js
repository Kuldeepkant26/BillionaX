import mongoose from "mongoose";

/**
 * One document per guest: the read watermark for the notification feed.
 *
 * A per-row `read` boolean would mean writing N documents on "mark all read"
 * and mutating CoinTransaction, which is append-only by contract. A single
 * timestamp makes "mark all read" one $set, and makes the unread count a range
 * query on indexes that already exist.
 */
const notificationStateSchema = new mongoose.Schema(
  {
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    lastReadAt: { type: Date, default: () => new Date(0) },
  },
  { timestamps: true }
);

export const NotificationState = mongoose.model("NotificationState", notificationStateSchema);
