import mongoose from "mongoose";
import {
  SUPPORT_SENDERS,
  SUPPORT_PARTIES,
  NOTIFICATION_KINDS,
  ROLES,
} from "../config/constants.js";
import { SupportMessage } from "../models/supportMessage.model.js";
import { User } from "../models/user.model.js";
import { emitToGuest, emitToAdmins, emitToUser } from "../realtime/emitter.js";
import * as notificationService from "./notification.service.js";

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * The shape every client renders.
 *
 * `authorName` is included only where it tells the reader something they do
 * not already know: on a hotel thread several managers share one property's
 * queue, so "Ravi asked" is real information. On a guest thread both sides are
 * a single person, and naming the admin who answered would leak staff
 * identities to guests for no benefit — so it is resolved by the callers that
 * populate, and simply absent elsewhere.
 */
const toPublic = (m) => ({
  id: String(m._id),
  sender: m.sender,
  body: m.body,
  readAt: m.readAt,
  createdAt: m.createdAt,
  ...(m.authorName ? { authorName: m.authorName } : null),
});

/** Adds authorName from a populated authorId, for the channels that show it. */
const toPublicWithAuthor = (m) =>
  toPublic({ ...m, authorName: m.authorId?.name || null });

/* ---- one thread, from its owner's side -------------------------------- */

/**
 * The owner's own conversation, oldest first.
 *
 * Ascending because a chat is read top to bottom and the newest message
 * belongs at the bottom of the scroller. That makes paging awkward, which is
 * why there is none: a support thread is tens of messages, not thousands, and
 * a limit here would hide the START of the conversation rather than the end.
 *
 * `party` is passed rather than inferred so a caller can never accidentally
 * read across channels — a hotel admin asking for their thread must not be
 * able to receive guest rows even if their ids collided.
 */
export const listForOwner = async ({ userId, party, withAuthors = false }) => {
  const query = SupportMessage.find({ userId: oid(userId), party }).sort({ createdAt: 1 });
  if (withAuthors) query.populate("authorId", "name");

  const messages = await query.lean();
  return { messages: messages.map(withAuthors ? toPublicWithAuthor : toPublic) };
};

/**
 * Marks every PLATFORM message in this thread as read.
 *
 * Scoped to sender: ADMIN so opening the chat never marks the owner's OWN
 * messages read — that flag belongs to the platform side, and clearing it here
 * would empty the main admin's unread badge from the owner's screen.
 */
export const markReadByOwner = async ({ userId, party }) => {
  const { modifiedCount } = await SupportMessage.updateMany(
    { userId: oid(userId), party, sender: SUPPORT_SENDERS.ADMIN, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return { unread: 0, marked: modifiedCount };
};

/** How many platform replies the owner has not opened yet. */
export const unreadForOwner = async ({ userId, party }) => {
  const unread = await SupportMessage.countDocuments({
    userId: oid(userId),
    party,
    sender: SUPPORT_SENDERS.ADMIN,
    readAt: null,
  });

  return { unread };
};

/**
 * Posts a message from the thread's owner.
 *
 * `hotelId` is stored only on the hotel channel, where the inbox groups by
 * property. Passing it on a guest thread would be meaningless — a guest can
 * belong to several hotels, so there is no single property a guest thread is
 * "about".
 */
export const sendFromOwner = async ({ userId, party, body, hotelId = null, authorName = null }) => {
  const doc = await SupportMessage.create({
    userId: oid(userId),
    party,
    hotelId: party === SUPPORT_PARTIES.HOTEL && hotelId ? oid(hotelId) : null,
    sender: SUPPORT_SENDERS.GUEST,
    // Set on both sides now: on a hotel thread this is how the panel shows
    // which of a property's managers asked.
    authorId: oid(userId),
    body,
  });

  const message = { ...toPublic(doc), ...(authorName ? { authorName } : null) };

  // To every signed-in main admin, so an open inbox moves without a refresh.
  // No notification row: admins have a panel with its own badge, and the
  // Notification collection is the guest alerts feed.
  emitToAdmins("support:message", {
    userId: String(userId),
    party,
    hotelId: hotelId ? String(hotelId) : null,
    message,
  });

  // Echoed back to the owner's own room, so the same thread open on a second
  // device (or a second tab) stays in step with the one they typed on.
  if (party === SUPPORT_PARTIES.GUEST) {
    emitToGuest(userId, "support:message", { message });
  } else {
    // The AUTHOR's own room, not the hotel room.
    //
    // Threads are per account, so a colleague has no business receiving this
    // — and the hotel room also contains HOTEL_STAFF, who cannot open support
    // at all. Broadcasting to the property and filtering in the client would
    // put private message bodies on the wire for people who may not read them,
    // which is not a boundary at all. The echo exists only so the author's own
    // second tab stays in step.
    emitToUser(userId, "support:message", { userId: String(userId), party, message });
  }

  return message;
};

/* ---- the platform side ------------------------------------------------ */

/**
 * Every conversation on one channel, most recently active first.
 *
 * One aggregation rather than a query per thread: the list needs the last
 * message, the total and the unread count together, and fetching those
 * separately is three round trips per row. $group over the userId index does
 * it in one pass.
 *
 * The owner lookup projects different fields per channel — a guest row shows a
 * phone, a hotel row shows an email and the property — but both come back in
 * the same `owner` shape so one component can draw either list.
 */
export const listThreads = async ({ party, page = 1, limit = 25, q = "" } = {}) => {
  const skip = (page - 1) * limit;
  const isHotel = party === SUPPORT_PARTIES.HOTEL;

  const pipeline = [
    { $match: { party } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$userId",
        hotelId: { $first: "$hotelId" },
        lastMessage: { $first: "$body" },
        lastSender: { $first: "$sender" },
        lastAt: { $first: "$createdAt" },
        messageCount: { $sum: 1 },
        // The platform's badge: owner messages nobody has answered or opened.
        unread: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ["$sender", SUPPORT_SENDERS.GUEST] },
                  { $eq: ["$readAt", null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
    { $sort: { lastAt: -1 } },
    {
      $lookup: {
        from: User.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "owner",
        pipeline: [{ $project: { name: 1, phone: 1, email: 1, avatarUrl: 1 } }],
      },
    },
    { $unwind: "$owner" },
  ];

  // The property's name, for the hotel channel's rows and its search.
  if (isHotel) {
    pipeline.push(
      {
        $lookup: {
          from: "hotels",
          localField: "hotelId",
          foreignField: "_id",
          as: "hotel",
          pipeline: [{ $project: { name: 1, city: 1, logoUrl: 1 } }],
        },
      },
      // preserveNull: a thread whose hotel was deleted must still be readable
      // rather than vanishing from the queue with its history.
      { $unwind: { path: "$hotel", preserveNullAndEmptyArrays: true } }
    );
  }

  // Applied AFTER the lookups because the term matches the OWNER and their
  // property, which live in other collections. The escape is the same one the
  // panel tables use — a raw term here would be a regex injection.
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    const fields = isHotel
      ? [{ "owner.name": rx }, { "owner.email": rx }, { "hotel.name": rx }]
      : [{ "owner.name": rx }, { "owner.phone": rx }];
    pipeline.push({ $match: { $or: fields } });
  }

  const [rows, totalRows] = await Promise.all([
    SupportMessage.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
    SupportMessage.aggregate([...pipeline, { $count: "n" }]),
  ]);

  return {
    threads: rows.map((r) => ({
      owner: {
        id: String(r.owner._id),
        name: r.owner.name,
        phone: r.owner.phone,
        email: r.owner.email,
        avatarUrl: r.owner.avatarUrl,
      },
      hotel: r.hotel ? { id: String(r.hotel._id), name: r.hotel.name, city: r.hotel.city } : null,
      party,
      lastMessage: r.lastMessage,
      lastSender: r.lastSender,
      lastAt: r.lastAt,
      messageCount: r.messageCount,
      unread: r.unread,
    })),
    page,
    limit,
    total: totalRows[0]?.n || 0,
  };
};

/**
 * Unread counts for the platform's nav badge, split by channel.
 *
 * One grouped query rather than two counts: the badge needs both numbers on
 * every panel load, and the tabs need them separately to label themselves.
 */
export const unreadForPlatform = async () => {
  const rows = await SupportMessage.aggregate([
    { $match: { sender: SUPPORT_SENDERS.GUEST, readAt: null } },
    { $group: { _id: "$party", n: { $sum: 1 } } },
  ]);

  const byParty = { [SUPPORT_PARTIES.GUEST]: 0, [SUPPORT_PARTIES.HOTEL]: 0 };
  for (const row of rows) if (row._id in byParty) byParty[row._id] = row.n;

  return {
    guest: byParty[SUPPORT_PARTIES.GUEST],
    hotel: byParty[SUPPORT_PARTIES.HOTEL],
    // The total is what the nav item draws; the split labels the two tabs.
    unread: byParty[SUPPORT_PARTIES.GUEST] + byParty[SUPPORT_PARTIES.HOTEL],
  };
};

/**
 * One thread, with its owner attached so the panel can title it.
 *
 * Returns messages even when there are none, so opening a thread that was just
 * emptied shows an empty conversation rather than a 404.
 *
 * The role check is what keeps the two channels honest: asking for a guest id
 * on the hotel channel returns null rather than that guest's conversation.
 */
export const getThread = async ({ userId, party }) => {
  const roles =
    party === SUPPORT_PARTIES.HOTEL ? [ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF] : [ROLES.GUEST];

  const [owner, messages] = await Promise.all([
    User.findOne({ _id: oid(userId), role: { $in: roles } })
      .select("name phone email avatarUrl createdAt hotelId")
      .populate("hotelId", "name city")
      .lean(),
    SupportMessage.find({ userId: oid(userId), party })
      .sort({ createdAt: 1 })
      .populate("authorId", "name")
      .lean(),
  ]);

  if (!owner) return null;

  return {
    owner: {
      id: String(owner._id),
      name: owner.name,
      phone: owner.phone,
      email: owner.email,
      avatarUrl: owner.avatarUrl,
      joinedAt: owner.createdAt,
    },
    hotel: owner.hotelId?._id
      ? { id: String(owner.hotelId._id), name: owner.hotelId.name, city: owner.hotelId.city }
      : null,
    party,
    // Authors are shown on the hotel channel, where several managers can share
    // a property — see toPublic.
    messages: messages.map(party === SUPPORT_PARTIES.HOTEL ? toPublicWithAuthor : toPublic),
  };
};

/**
 * Marks the owner's messages read. The platform-side mirror of markReadByOwner.
 *
 * Returns the RECOUNTED badge totals rather than just how many rows changed.
 *
 * The caller previously had to fire a second /unread-count request to refresh
 * the nav badge, which raced this write: two requests, no ordering guarantee,
 * and the count could be computed against a snapshot taken before the update
 * landed — leaving a badge on a thread the admin had just read. Counting here,
 * after the write, on the same connection, removes the race rather than
 * narrowing it.
 */
export const markReadByPlatform = async ({ userId, party }) => {
  const { modifiedCount } = await SupportMessage.updateMany(
    { userId: oid(userId), party, sender: SUPPORT_SENDERS.GUEST, readAt: null },
    { $set: { readAt: new Date() } }
  );

  const counts = await unreadForPlatform();
  return { marked: modifiedCount, ...counts };
};

/**
 * Posts a reply from the platform team.
 *
 * Returns null when the target is not a valid owner for this channel, which
 * the controller turns into a 404 — the same guard as getThread, so a reply
 * can never create a thread for somebody who could not own one.
 */
export const sendFromPlatform = async ({ userId, party, adminId, body }) => {
  const roles =
    party === SUPPORT_PARTIES.HOTEL ? [ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF] : [ROLES.GUEST];

  const owner = await User.findOne({ _id: oid(userId), role: { $in: roles } })
    .select("_id hotelId")
    .lean();
  if (!owner) return null;

  const hotelId = party === SUPPORT_PARTIES.HOTEL ? owner.hotelId : null;

  const doc = await SupportMessage.create({
    userId: oid(userId),
    party,
    hotelId: hotelId ? oid(hotelId) : null,
    sender: SUPPORT_SENDERS.ADMIN,
    authorId: adminId ? oid(adminId) : null,
    body,
  });

  // The platform's own name is not attached: a guest is never shown which
  // admin answered, and on a hotel thread "Billionax support" is the useful
  // identity rather than an individual's name.
  const message = toPublic(doc);

  // Live to the owner...
  if (party === SUPPORT_PARTIES.GUEST) {
    emitToGuest(userId, "support:message", { message });
  } else {
    // The owner alone — see sendFromOwner for why this is not the hotel room.
    emitToUser(userId, "support:message", { userId: String(userId), party, message });
  }

  // ...and to other admins, so two people working the same queue see each
  // other's replies rather than both typing one.
  emitToAdmins("support:message", {
    userId: String(userId),
    party,
    hotelId: hotelId ? String(hotelId) : null,
    message,
  });

  // A guest may have closed the app entirely, so the reply also lands in their
  // alerts. Hotel admins get no notification row: that feed is the guest app's,
  // and the panel has its own badge which useHotelSupportBadge keeps live.
  //
  // No dedupeKey on purpose: every reply is its own event, and a key would
  // silently drop the second answer to the same question.
  if (party === SUPPORT_PARTIES.GUEST) {
    await notificationService.notify({
      guestId: userId,
      kind: NOTIFICATION_KINDS.SUPPORT_REPLY,
      title: "Support replied",
      // Truncated rather than sent whole: this lands in a notification list,
      // and the full text is one tap away in the chat it points at.
      body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
      href: "/app/help/chat",
    });
  }

  return message;
};
