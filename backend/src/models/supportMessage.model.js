import mongoose from "mongoose";
import { SUPPORT_SENDER_VALUES, SUPPORT_PARTY_VALUES, SUPPORT_PARTIES } from "../config/constants.js";

/**
 * One message in a support conversation, on either of the platform's two
 * support channels: a guest asking about their account, or a hotel admin
 * asking the platform team.
 *
 * There is no Thread document. A conversation IS the set of messages sharing a
 * `userId`, and each inbox is an aggregation over this collection. A separate
 * parent would need its own lastMessageAt, unreadCount and messageCount, each
 * of which can drift out of step with the messages themselves — and the only
 * thing it would buy is a cheaper list query on a collection that holds a
 * handful of rows per person.
 *
 * `userId` is the PERSON who owns the thread — a guest, or one hotel admin.
 * Hotel threads are per ACCOUNT rather than per hotel, so two managers at the
 * same property have separate conversations; `hotelId` is denormalised on
 * hotel-side rows so the inbox can group and label by property without a join
 * per thread.
 *
 * `party` says which channel a thread belongs to, and is what separates the
 * two inboxes. It is stored rather than derived from the user's role, because
 * a role can change: promoting a hotel admin must not silently move their
 * conversation history into the guest queue.
 *
 * `sender` is which SIDE typed it — the thread owner, or the platform. It is
 * deliberately not a userId comparison, so a client can pick a bubble side
 * without knowing who answered. `authorId` is kept alongside for the audit
 * trail, and on hotel threads it is also what lets the panel show which of a
 * property's managers wrote a given message.
 *
 * Deliberately NOT a Notification: notices are disposable context with a
 * 180-day TTL, and a support conversation is a record of what the platform
 * told someone. Alerts still announce a reply — see support.service.js — but
 * the message itself lives here.
 */
const supportMessageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    party: {
      type: String,
      enum: SUPPORT_PARTY_VALUES,
      required: true,
      default: SUPPORT_PARTIES.GUEST,
    },

    /**
     * The property this thread belongs to. Null only on the GUEST channel.
     *
     * On HOTEL it is denormalised from the author's account so the platform
     * inbox can show and search by property without joining User on every row
     * — and so a thread keeps the hotel it was actually about even if the
     * account later moves.
     *
     * On HOTEL_GUEST it is not a label but half of the THREAD KEY. A guest can
     * hold memberships at several properties, so {userId} names a person while
     * {userId, hotelId} names a conversation. Every read on that channel must
     * carry it; see isHotelScopedParty.
     */
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", default: null, index: true },

    sender: { type: String, enum: SUPPORT_SENDER_VALUES, required: true },

    /**
     * Who actually typed it.
     *
     * Set on BOTH sides now, unlike the guest-only version this replaces: on a
     * hotel thread the platform needs to know which main admin answered, and
     * the hotel panel shows which of its own managers asked.
     */
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    body: { type: String, required: true, trim: true, maxlength: 2000 },

    /**
     * When the OTHER side read it.
     *
     * Per-message rather than a lastReadAt watermark on a thread, because both
     * sides read independently and a single timestamp cannot say which of them
     * is behind. A count of unread rows is then one indexed query.
     */
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The conversation view: every message in one thread, oldest first.
supportMessageSchema.index({ userId: 1, createdAt: 1 });

// Each inbox's thread list, newest activity first, scoped to one channel.
supportMessageSchema.index({ party: 1, createdAt: -1 });

// Unread badges on every channel. Partial because read messages are the
// overwhelming majority and never match.
supportMessageSchema.index(
  { party: 1, sender: 1, userId: 1 },
  { partialFilterExpression: { readAt: null } }
);

/*
 * The HOTEL_GUEST thread key, and the hotel's own inbox.
 *
 * hotelId leads because that channel's queue is read one property at a time —
 * "every conversation at this hotel" — which the index above cannot serve: it
 * starts at party and would scan every hotel's rows to find one's. The trailing
 * createdAt gives both the thread's own ordering and the queue's sort.
 */
supportMessageSchema.index({ hotelId: 1, party: 1, userId: 1, createdAt: 1 });

// That queue's unread badge: one hotel's unanswered guest messages.
supportMessageSchema.index(
  { hotelId: 1, party: 1, sender: 1 },
  { partialFilterExpression: { readAt: null } }
);

export const SupportMessage = mongoose.model("SupportMessage", supportMessageSchema);
