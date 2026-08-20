import mongoose from "mongoose";
import { TX_TYPES } from "../config/constants.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { Notification } from "../models/notification.model.js";
import { NotificationState } from "../models/notificationState.model.js";
import { emitToGuest } from "../realtime/emitter.js";

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const inr = (n) => Math.abs(n).toLocaleString("en-IN");

/** Human copy for each ledger row type. */
const TX_COPY = {
  [TX_TYPES.WELCOME]: (t) => ({
    title: "Welcome coins added",
    body: `${inr(t.coins)} coins to get you started${t.hotelId?.name ? ` at ${t.hotelId.name}` : ""}.`,
  }),
  [TX_TYPES.EARN]: (t) => ({
    title: "Coins earned from your stay",
    body: `+${inr(t.coins)} coins${t.hotelId?.name ? ` at ${t.hotelId.name}` : ""}.`,
  }),
  [TX_TYPES.REDEEM]: (t) => ({
    title: "Coins used on your bill",
    body: `${inr(t.coins)} coins off${t.outlet ? ` at ${t.outlet}` : ""}.`,
  }),
  [TX_TYPES.ADJUSTMENT]: (t) => ({
    title: t.coins > 0 ? "Coins added for you" : "Coins adjusted",
    body: t.note || `${t.coins > 0 ? "+" : "−"}${inr(t.coins)} coins.`,
  }),
};

/** Projects a ledger row into the feed's shape. */
const fromTransaction = (t) => {
  const build = TX_COPY[t.type] || TX_COPY[TX_TYPES.ADJUSTMENT];
  return {
    id: `tx:${t._id}`,
    source: "LEDGER",
    kind: t.type,
    coins: t.coins,
    hotel: t.hotelId?._id ? { id: t.hotelId._id, name: t.hotelId.name } : null,
    href: "/app/history",
    createdAt: t.createdAt,
    ...build(t),
  };
};

const fromNotice = (n) => ({
  id: `nt:${n._id}`,
  source: "NOTICE",
  kind: n.kind,
  coins: null,
  hotel: n.hotelId?._id ? { id: n.hotelId._id, name: n.hotelId.name } : null,
  href: n.href || "/app",
  title: n.title,
  body: n.body,
  meta: n.meta,
  createdAt: n.createdAt,
});

export const getState = async (guestId) =>
  NotificationState.findOneAndUpdate(
    { guestId: oid(guestId) },
    { $setOnInsert: { lastReadAt: new Date(0) } },
    { new: true, upsert: true }
  );

/**
 * The unread badge: two indexed range counts, no scan. Both collections are
 * indexed {guestId:1, createdAt:-1}, which is exactly this query.
 */
export const unreadCount = async (guestId) => {
  const { lastReadAt } = await getState(guestId);
  const gid = oid(guestId);

  const [ledger, notices] = await Promise.all([
    CoinTransaction.countDocuments({ guestId: gid, createdAt: { $gt: lastReadAt } }),
    Notification.countDocuments({ guestId: gid, createdAt: { $gt: lastReadAt } }),
  ]);

  return { unread: ledger + notices, lastReadAt };
};

/**
 * The merged feed, newest first, across every hotel the guest belongs to.
 *
 * Over-fetches `page * limit` from each source then merge-sorts and slices.
 * At this app's volume that is far cheaper than a $unionWith needing identical
 * shapes across two collections; revisit if one guest ever exceeds ~10k rows.
 */
export const listFeed = async ({ guestId, page = 1, limit = 25 }) => {
  const gid = oid(guestId);
  const take = page * limit;

  const [txs, notices, state] = await Promise.all([
    CoinTransaction.find({ guestId: gid })
      .populate("hotelId", "name slug")
      .sort({ createdAt: -1 })
      .limit(take)
      .lean(),
    Notification.find({ guestId: gid })
      .populate("hotelId", "name slug")
      .sort({ createdAt: -1 })
      .limit(take)
      .lean(),
    getState(guestId),
  ]);

  const merged = [...txs.map(fromTransaction), ...notices.map(fromNotice)].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  const items = merged.slice((page - 1) * limit, take).map((item) => ({
    ...item,
    read: new Date(item.createdAt) <= new Date(state.lastReadAt),
  }));

  return {
    items,
    page,
    limit,
    // hasMore rather than an exact total: a true total means counting both
    // collections on every page load for a number the UI never shows.
    hasMore: merged.length > take,
    lastReadAt: state.lastReadAt,
  };
};

export const markAllRead = async (guestId) => {
  const now = new Date();
  await NotificationState.updateOne(
    { guestId: oid(guestId) },
    { $set: { lastReadAt: now } },
    { upsert: true }
  );
  emitToGuest(guestId, "notification:read", { lastReadAt: now, unread: 0 });
  return { lastReadAt: now, unread: 0 };
};

/** Creates a non-ledger notice and pushes it live. The only writer of Notification. */
export const notify = async ({ guestId, hotelId, kind, title, body, href, meta, dedupeKey }) => {
  try {
    const doc = await Notification.create({
      guestId,
      hotelId,
      kind,
      title,
      body,
      href,
      meta,
      dedupeKey,
    });

    await doc.populate("hotelId", "name slug");
    const { unread } = await unreadCount(guestId);
    emitToGuest(guestId, "notification:new", { item: fromNotice(doc), unread });
    return doc;
  } catch (error) {
    // A duplicate dedupeKey means the notice already exists — not an error.
    if (error?.code === 11000) return null;
    throw error;
  }
};

/**
 * Pushes an ALREADY-COMMITTED ledger row to the guest. Writes nothing.
 * Call only after the coin mutation has fully committed.
 */
export const pushLedgerEvent = async ({ guestId, transaction, hotel }) => {
  if (!guestId || !transaction) return;

  try {
    const raw = transaction.toObject ? transaction.toObject() : transaction;
    const item = fromTransaction({
      ...raw,
      hotelId: hotel ? { _id: hotel._id, name: hotel.name } : raw.hotelId,
    });
    const { unread } = await unreadCount(guestId);
    emitToGuest(guestId, "notification:new", { item, unread });
  } catch {
    // Deliberately swallowed. The notification is a VIEW of a committed fact:
    // the coins have already moved and the row is already in the ledger, so
    // the guest sees it on next open regardless. Letting this bubble would
    // turn a cosmetic failure into a 500 on a successful redemption.
  }
};
