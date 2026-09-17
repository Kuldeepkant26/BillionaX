import mongoose from "mongoose";
import {
  SUPPORT_SENDERS,
  SUPPORT_PARTIES,
  NOTIFICATION_KINDS,
  ROLES,
  isHotelScopedParty,
} from "../config/constants.js";
import { SupportMessage } from "../models/supportMessage.model.js";
import { User } from "../models/user.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { emitToGuest, emitToAdmins, emitToUser, emitToHotel } from "../realtime/emitter.js";
import * as notificationService from "./notification.service.js";

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * The mongo filter naming ONE conversation.
 *
 * Every owner-side read and write goes through this rather than composing
 * `{ userId, party }` inline, because the HOTEL_GUEST channel is keyed by a
 * pair: a guest belongs to many hotels, so a filter that forgets hotelId does
 * not error — it quietly returns the guest's conversations with EVERY hotel,
 * merged into one thread and shown to whichever property asked. That is a
 * disclosure bug whose output looks entirely plausible, so it is refused here
 * rather than guarded at each of the six call sites.
 */
const threadFilter = ({ userId, party, hotelId }) => {
  const filter = { userId: oid(userId), party };

  if (isHotelScopedParty(party)) {
    if (!hotelId) {
      throw new Error(`support: party ${party} requires a hotelId to name a thread`);
    }
    filter.hotelId = oid(hotelId);
  }

  return filter;
};

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
export const listForOwner = async ({ userId, party, hotelId = null, withAuthors = false }) => {
  const query = SupportMessage.find(threadFilter({ userId, party, hotelId })).sort({
    createdAt: 1,
  });
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
export const markReadByOwner = async ({ userId, party, hotelId = null }) => {
  const { modifiedCount } = await SupportMessage.updateMany(
    { ...threadFilter({ userId, party, hotelId }), sender: SUPPORT_SENDERS.ADMIN, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return { unread: 0, marked: modifiedCount };
};

/** How many replies the owner has not opened yet, in ONE thread. */
export const unreadForOwner = async ({ userId, party, hotelId = null }) => {
  const unread = await SupportMessage.countDocuments({
    ...threadFilter({ userId, party, hotelId }),
    sender: SUPPORT_SENDERS.ADMIN,
    readAt: null,
  });

  return { unread };
};

/**
 * A guest's unread replies from their HOTELS, totalled and split per property.
 *
 * Deliberately not unreadForOwner on the HOTEL_GUEST channel: that counts one
 * thread, and a guest who belongs to three hotels has three. The Help screen
 * needs the total for its badge AND the per-hotel split to dot the right row
 * in the switcher, and both come from one grouped pass.
 */
export const unreadFromHotels = async ({ userId }) => {
  const rows = await SupportMessage.aggregate([
    {
      $match: {
        userId: oid(userId),
        party: SUPPORT_PARTIES.HOTEL_GUEST,
        sender: SUPPORT_SENDERS.ADMIN,
        readAt: null,
      },
    },
    { $group: { _id: "$hotelId", n: { $sum: 1 } } },
  ]);

  const byHotel = {};
  let unread = 0;
  for (const row of rows) {
    if (!row._id) continue;
    byHotel[String(row._id)] = row.n;
    unread += row.n;
  }

  return { unread, byHotel };
};

/**
 * Posts a message from the thread's owner.
 *
 * `hotelId` is stored on both hotel-bearing channels, but means different
 * things: on HOTEL it labels the property a manager is asking about, and on
 * HOTEL_GUEST it is half the thread key — threadFilter refuses the write
 * without it rather than silently opening a null-hotel thread.
 *
 * It is still meaningless on GUEST, where a guest belongs to several hotels
 * and no single property is what the thread is "about".
 */
export const sendFromOwner = async ({ userId, party, body, hotelId = null, authorName = null }) => {
  // Validates the pair before writing, so a HOTEL_GUEST message can never be
  // stored with a null hotelId and become unreachable from either side.
  threadFilter({ userId, party, hotelId });

  const storedHotelId =
    (party === SUPPORT_PARTIES.HOTEL || isHotelScopedParty(party)) && hotelId ? oid(hotelId) : null;

  const doc = await SupportMessage.create({
    userId: oid(userId),
    party,
    hotelId: storedHotelId,
    sender: SUPPORT_SENDERS.GUEST,
    // Set on both sides now: on a hotel thread this is how the panel shows
    // which of a property's managers asked.
    authorId: oid(userId),
    body,
  });

  const message = { ...toPublic(doc), ...(authorName ? { authorName } : null) };

  if (isHotelScopedParty(party)) {
    // This channel's recipient is the PROPERTY, not the platform. The main
    // admin is not a party to it and its rows never enter their queue, so
    // emitToAdmins is deliberately skipped — sending it would put a
    // conversation they cannot open into an inbox that counts it.
    //
    // The hotel room is the right unit here, unlike the HOTEL channel below:
    // this thread belongs to the property rather than to one manager, and
    // front-desk staff answer it too, so every account in the room is an
    // intended reader.
    emitToHotel(hotelId, "support:message", {
      userId: String(userId),
      party,
      hotelId: String(hotelId),
      message,
    });
  } else {
    // To every signed-in main admin, so an open inbox moves without a refresh.
    // No notification row: admins have a panel with its own badge, and the
    // Notification collection is the guest alerts feed.
    emitToAdmins("support:message", {
      userId: String(userId),
      party,
      hotelId: hotelId ? String(hotelId) : null,
      message,
    });
  }

  // Echoed back to the owner's own room, so the same thread open on a second
  // device (or a second tab) stays in step with the one they typed on.
  if (party === SUPPORT_PARTIES.GUEST) {
    emitToGuest(userId, "support:message", { message });
  } else if (isHotelScopedParty(party)) {
    // The guest's own echo, carrying the hotelId: their app may have a
    // DIFFERENT property's thread open, and without it the client cannot tell
    // whether this message belongs on the screen it is showing.
    emitToGuest(userId, "support:message", {
      party,
      hotelId: String(hotelId),
      message,
    });
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

/* ---- the hotel's own guest queue (HOTEL_GUEST) ------------------------ */

/**
 * Every guest conversation at ONE property, most recently active first.
 *
 * The hotel-side mirror of listThreads, kept separate rather than folded into
 * it with another flag. That function's $match opens at `{ party }` — a
 * platform queue is every thread on a channel — whereas this one must never
 * leave a single property, and the difference is a security boundary rather
 * than a filter. Merging them would make hotelId an optional argument on a
 * function whose safety depends on it being present.
 *
 * Grouped by userId, so one guest is one row however many messages they sent.
 */
export const listHotelGuestThreads = async ({ hotelId, page = 1, limit = 25, q = "" } = {}) => {
  const skip = (page - 1) * limit;

  const pipeline = [
    // hotelId first, and never absent: this is the whole boundary.
    { $match: { hotelId: oid(hotelId), party: SUPPORT_PARTIES.HOTEL_GUEST } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$userId",
        lastMessage: { $first: "$body" },
        lastSender: { $first: "$sender" },
        lastAt: { $first: "$createdAt" },
        messageCount: { $sum: 1 },
        // This desk's badge: guest messages nobody here has opened.
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
        pipeline: [{ $project: { name: 1, phone: 1, avatarUrl: 1 } }],
      },
    },
    { $unwind: "$owner" },
  ];

  // Same escape as the panel tables — a raw term here is a regex injection.
  // Email is not searchable on this channel: the desk knows its guests by name
  // and phone, and those are the only fields the row shows.
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");
    pipeline.push({ $match: { $or: [{ "owner.name": rx }, { "owner.phone": rx }] } });
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
        avatarUrl: r.owner.avatarUrl,
      },
      party: SUPPORT_PARTIES.HOTEL_GUEST,
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

/** This property's unread guest messages, for the panel's nav badge. */
export const unreadForHotel = async ({ hotelId }) => {
  const unread = await SupportMessage.countDocuments({
    hotelId: oid(hotelId),
    party: SUPPORT_PARTIES.HOTEL_GUEST,
    sender: SUPPORT_SENDERS.GUEST,
    readAt: null,
  });

  return { unread };
};

/**
 * One guest's thread at this property, with the guest attached to title it.
 *
 * Returns null when this guest has no membership here, which the controller
 * turns into a 404. Membership rather than role is the check that matters: the
 * id in the path is client input, and without it one hotel could read a
 * conversation a guest had with a DIFFERENT property by guessing an id.
 */
export const getHotelGuestThread = async ({ hotelId, userId }) => {
  const [membership, owner, messages] = await Promise.all([
    GuestHotelMembership.findOne({ guestId: oid(userId), hotelId: oid(hotelId) })
      .select("_id tier createdAt")
      .lean(),
    User.findOne({ _id: oid(userId), role: ROLES.GUEST })
      .select("name phone avatarUrl createdAt")
      .lean(),
    SupportMessage.find({
      userId: oid(userId),
      hotelId: oid(hotelId),
      party: SUPPORT_PARTIES.HOTEL_GUEST,
    })
      .sort({ createdAt: 1 })
      .populate("authorId", "name")
      .lean(),
  ]);

  if (!membership || !owner) return null;

  return {
    owner: {
      id: String(owner._id),
      name: owner.name,
      phone: owner.phone,
      avatarUrl: owner.avatarUrl,
      joinedAt: owner.createdAt,
      tier: membership.tier,
    },
    party: SUPPORT_PARTIES.HOTEL_GUEST,
    // Authors ARE shown here: several people work one desk, so "Ravi replied"
    // tells the next person on shift who already answered.
    messages: messages.map(toPublicWithAuthor),
  };
};

/**
 * Marks a guest's messages read, from the hotel's side.
 *
 * Returns the recounted badge for this property, for the same reason
 * markReadByPlatform does: a separate /unread-count call would race this write
 * and could leave a badge on a thread the desk had just read.
 */
export const markReadByHotel = async ({ hotelId, userId }) => {
  const { modifiedCount } = await SupportMessage.updateMany(
    {
      userId: oid(userId),
      hotelId: oid(hotelId),
      party: SUPPORT_PARTIES.HOTEL_GUEST,
      sender: SUPPORT_SENDERS.GUEST,
      readAt: null,
    },
    { $set: { readAt: new Date() } }
  );

  const counts = await unreadForHotel({ hotelId });
  return { marked: modifiedCount, ...counts };
};

/**
 * Posts the hotel's reply to one of its guests.
 *
 * Returns null when the guest has no membership here — the same guard as
 * getHotelGuestThread, so a reply can never open a thread with somebody who
 * is not this property's guest.
 */
export const sendFromHotel = async ({ hotelId, userId, authorId, authorName = null, body }) => {
  const membership = await GuestHotelMembership.findOne({
    guestId: oid(userId),
    hotelId: oid(hotelId),
  })
    .select("_id")
    .lean();
  if (!membership) return null;

  const doc = await SupportMessage.create({
    userId: oid(userId),
    hotelId: oid(hotelId),
    party: SUPPORT_PARTIES.HOTEL_GUEST,
    // ADMIN means "the side that answers", not "the main admin" — see the
    // SUPPORT_SENDERS comment on why these names are historical.
    sender: SUPPORT_SENDERS.ADMIN,
    authorId: authorId ? oid(authorId) : null,
    body,
  });

  // The guest is shown the PROPERTY as the sender, never the individual at the
  // desk — the same reason a guest is not told which platform admin answered.
  const message = toPublic(doc);

  emitToGuest(userId, "support:message", {
    party: SUPPORT_PARTIES.HOTEL_GUEST,
    hotelId: String(hotelId),
    message,
  });

  // To the desk, so a colleague sees the reply rather than answering twice.
  // authorName is attached on THIS side only: the panel shows who replied.
  emitToHotel(hotelId, "support:message", {
    userId: String(userId),
    party: SUPPORT_PARTIES.HOTEL_GUEST,
    hotelId: String(hotelId),
    message: { ...message, ...(authorName ? { authorName } : null) },
  });

  // The guest may have closed the app, so the reply also lands in their alerts.
  // Pointed at this hotel's thread specifically, since they may have several.
  await notificationService.notify({
    guestId: userId,
    kind: NOTIFICATION_KINDS.SUPPORT_REPLY,
    title: "Your hotel replied",
    body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
    href: `/app/help/hotel/${hotelId}`,
  });

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
