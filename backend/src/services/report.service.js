import mongoose from "mongoose";
import { TX_TYPES, BILL_STATUS, ROLES } from "../config/constants.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { Bill } from "../models/bill.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { RebateSettlement } from "../models/rebateSettlement.model.js";
import { searchRegex } from "../utils/regex.util.js";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysAgo = (n) => {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
};

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/**
 * Excludes demo rows from every money figure.
 *
 * `$ne: true` rather than `false` on purpose: every row written before demo
 * mode existed has no isDemo field at all, and `{isDemo: false}` would match
 * none of them — silently zeroing all historical revenue.
 *
 * Demo bills are deliberately real rows (so a demonstration produces genuine
 * history and reports) and this is what keeps them out of the numbers that
 * matter: revenue, commission and settlement reconciliation.
 */
export const EXCLUDE_DEMO = { isDemo: { $ne: true } };

/** Local calendar date as YYYY-MM-DD. See the note in rebate.service.js. */
const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Coin flow per day for the last N days, used by the dashboard charts. */
const dailySeries = async (match, days = 7) => {
  const rows = await CoinTransaction.aggregate([
    { $match: { ...match, ...EXCLUDE_DEMO, createdAt: { $gte: daysAgo(days - 1) } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        earned: { $sum: { $cond: [{ $gt: ["$coins", 0] }, "$coins", 0] } },
        redeemed: { $sum: { $cond: [{ $lt: ["$coins", 0] }, { $abs: "$coins" }, 0] } },
        revenue: { $sum: { $ifNull: ["$cashPayable", 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDate = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: days }, (_, i) => {
    const date = daysAgo(days - 1 - i).toISOString().slice(0, 10);
    const row = byDate.get(date);
    return {
      date,
      earned: row?.earned || 0,
      redeemed: row?.redeemed || 0,
      revenue: row?.revenue || 0,
    };
  });
};

/**
 * Coins redeemed grouped by calendar month, with the rebate settled against
 * each one.
 *
 * Months with no activity are filled in as zeroes rather than omitted, so a
 * chart or table reads as a continuous timeline instead of silently closing
 * the gap where a quiet month was.
 *
 * `from`/`to` make this serve both the "last N months" default and an
 * arbitrary custom range from the dashboard filter.
 */
export const monthlyRedemptions = async ({ hotelId = null, from, to, months = 12 } = {}) => {
  const end = to ? new Date(to) : new Date();
  // Half-open upper bound: include every redemption on the `to` day itself.
  const rangeEnd = new Date(end.getFullYear(), end.getMonth() + 1, 1);

  const start = from
    ? new Date(from)
    : new Date(end.getFullYear(), end.getMonth() - (months - 1), 1);
  const rangeStart = new Date(start.getFullYear(), start.getMonth(), 1);

  const match = {
    type: TX_TYPES.REDEEM,
    createdAt: { $gte: rangeStart, $lt: rangeEnd },
    ...EXCLUDE_DEMO,
  };
  if (hotelId) match.hotelId = oid(hotelId);

  const [rows, settlements] = await Promise.all([
    CoinTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          coinsRedeemed: { $sum: { $abs: "$coins" } },
          revenue: { $sum: { $ifNull: ["$cashPayable", 0] } },
          bills: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    RebateSettlement.aggregate([
      {
        $match: {
          ...(hotelId ? { hotelId: oid(hotelId) } : {}),
          periodStart: { $gte: rangeStart, $lt: rangeEnd },
        },
      },
      {
        $group: {
          _id: "$period",
          coinsCredited: { $sum: "$coinsCredited" },
          ratePercent: { $max: "$ratePercent" },
        },
      },
    ]),
  ]);

  const byMonth = new Map(rows.map((r) => [r._id, r]));
  const creditByMonth = new Map(settlements.map((r) => [r._id, r]));

  // Walk the range month by month so gaps become explicit zero rows.
  const series = [];
  const cursor = new Date(rangeStart);

  while (cursor < rangeEnd) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const row = byMonth.get(key);
    const credit = creditByMonth.get(key);

    series.push({
      month: key,
      coinsRedeemed: row?.coinsRedeemed || 0,
      revenue: row?.revenue || 0,
      bills: row?.bills || 0,
      coinsCredited: credit?.coinsCredited || 0,
      // Null rather than 0 so the UI can tell "not settled yet" from "settled
      // at a rate of zero".
      ratePercent: credit ? credit.ratePercent : null,
      settled: Boolean(credit),
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  const totals = series.reduce(
    (acc, m) => ({
      coinsRedeemed: acc.coinsRedeemed + m.coinsRedeemed,
      revenue: acc.revenue + m.revenue,
      bills: acc.bills + m.bills,
      coinsCredited: acc.coinsCredited + m.coinsCredited,
    }),
    { coinsRedeemed: 0, revenue: 0, bills: 0, coinsCredited: 0 }
  );

  return {
    // Local-time formatting, not toISOString(): the boundaries are built with
    // local-time Date constructors, and UTC conversion would report a range
    // starting a day early in any positive offset such as IST.
    from: localDate(rangeStart),
    to: localDate(new Date(rangeEnd - 1)),
    series,
    totals,
  };
};

export const hotelDashboard = async (hotelId) => {
  const hid = oid(hotelId);
  const today = startOfToday();

  const [hotel, newMembersToday, redeemedToday, pendingBills, totals, recent, series] =
    await Promise.all([
      Hotel.findById(hotelId),
      GuestHotelMembership.countDocuments({ hotelId: hid, joinedAt: { $gte: today } }),
      CoinTransaction.aggregate([
        { $match: { hotelId: hid, type: TX_TYPES.REDEEM, ...EXCLUDE_DEMO, createdAt: { $gte: today } } },
        {
          $group: {
            _id: null,
            coins: { $sum: { $abs: "$coins" } },
            revenue: { $sum: "$cashPayable" },
            count: { $sum: 1 },
          },
        },
      ]),
      // Bills sent but not yet settled. Was a count of live voucher codes,
      // until billing moved into the app.
      Bill.countDocuments({
        hotelId: hid,
        status: BILL_STATUS.PENDING,
        expiresAt: { $gt: new Date() },
      }),
      GuestHotelMembership.aggregate([
        { $match: { hotelId: hid } },
        {
          $group: {
            _id: null,
            members: { $sum: 1 },
            outstanding: { $sum: "$balance" },
          },
        },
      ]),
      CoinTransaction.find({ hotelId: hid })
        .populate("guestId", "name phone")
        .sort({ createdAt: -1 })
        .limit(8),
      dailySeries({ hotelId: hid }),
    ]);

  return {
    hotel: {
      name: hotel?.name,
      coinInventory: hotel?.coinInventory || 0,
      totalCoinsAllocated: hotel?.totalCoinsAllocated || 0,
      totalCoinsRedeemed: hotel?.totalCoinsRedeemed || 0,
    },
    today: {
      newMembers: newMembersToday,
      coinsRedeemed: redeemedToday[0]?.coins || 0,
      revenue: redeemedToday[0]?.revenue || 0,
      bills: redeemedToday[0]?.count || 0,
    },
    pendingBills,
    members: totals[0]?.members || 0,
    outstandingCoins: totals[0]?.outstanding || 0,
    recent,
    series,
  };
};

export const adminDashboard = async () => {
  const [hotelStats, guests, redeem, topHotels, series, memberships] = await Promise.all([
    Hotel.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ["$isActive", 1, 0] } },
          inventory: { $sum: "$coinInventory" },
          purchased: { $sum: "$totalCoinsPurchased" },
          allocated: { $sum: "$totalCoinsAllocated" },
          redeemed: { $sum: "$totalCoinsRedeemed" },
        },
      },
    ]),
    User.countDocuments({ role: ROLES.GUEST }),
    CoinTransaction.aggregate([
      { $match: { type: TX_TYPES.REDEEM, ...EXCLUDE_DEMO } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$cashPayable" },
          fee: { $sum: "$platformFee" },
          bills: { $sum: 1 },
        },
      },
    ]),
    CoinTransaction.aggregate([
      { $match: { type: TX_TYPES.REDEEM, ...EXCLUDE_DEMO } },
      {
        $group: {
          _id: "$hotelId",
          revenue: { $sum: "$cashPayable" },
          fee: { $sum: "$platformFee" },
          bills: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      { $lookup: { from: "hotels", localField: "_id", foreignField: "_id", as: "hotel" } },
      { $unwind: "$hotel" },
      {
        $project: {
          name: "$hotel.name",
          city: "$hotel.city",
          revenue: 1,
          fee: 1,
          bills: 1,
        },
      },
    ]),
    dailySeries({}),
    GuestHotelMembership.aggregate([
      { $group: { _id: null, outstanding: { $sum: "$balance" }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    hotels: {
      total: hotelStats[0]?.total || 0,
      active: hotelStats[0]?.active || 0,
    },
    coins: {
      inventory: hotelStats[0]?.inventory || 0,
      purchased: hotelStats[0]?.purchased || 0,
      allocated: hotelStats[0]?.allocated || 0,
      redeemed: hotelStats[0]?.redeemed || 0,
      outstanding: memberships[0]?.outstanding || 0,
    },
    guests,
    memberships: memberships[0]?.count || 0,
    revenue: redeem[0]?.revenue || 0,
    commission: redeem[0]?.fee || 0,
    bills: redeem[0]?.bills || 0,
    topHotels,
    series,
  };
};

export const listTransactions = async ({
  hotelId,
  guestId,
  type,
  outlet,
  minCoins,
  minBillAmount,
  from,
  to,
  page = 1,
  limit = 25,
}) => {
  const filter = {};
  if (hotelId) filter.hotelId = oid(hotelId);
  if (guestId) filter.guestId = oid(guestId);
  if (type) filter.type = type;
  if (outlet) filter.outlet = outlet;

  // coins is signed (+credit, -debit), so "at least N coins moved" has to
  // compare the magnitude rather than the raw value.
  if (minCoins != null) {
    filter.$expr = { $gte: [{ $abs: "$coins" }, minCoins] };
  }
  if (minBillAmount != null) filter.billAmount = { $gte: minBillAmount };

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    CoinTransaction.find(filter)
      .populate("guestId", "name phone")
      .populate("hotelId", "name slug")
      .populate("performedBy", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CoinTransaction.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const listMembers = async ({
  hotelId,
  q,
  tier,
  minBalance,
  maxBalance,
  joinedFrom,
  joinedTo,
  page = 1,
  limit = 25,
}) => {
  const match = { hotelId: oid(hotelId) };
  if (tier) match.tier = tier;

  if (minBalance != null || maxBalance != null) {
    match.balance = {};
    if (minBalance != null) match.balance.$gte = minBalance;
    if (maxBalance != null) match.balance.$lte = maxBalance;
  }

  if (joinedFrom || joinedTo) {
    match.joinedAt = {};
    if (joinedFrom) match.joinedAt.$gte = new Date(joinedFrom);
    if (joinedTo) match.joinedAt.$lte = new Date(joinedTo);
  }

  const rx = searchRegex(q);

  // $lookup rather than a pre-query into $in. The previous implementation
  // loaded EVERY matching guest _id on the platform into memory and shipped
  // them back as an $in — and it was not hotel-scoped, so one hotel's search
  // cost grew with the platform's total guest count.
  const [result] = await GuestHotelMembership.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "users",
        localField: "guestId",
        foreignField: "_id",
        as: "guest",
        // email is needed so the hotel's edit-member form can prefill it —
        // guests can change it themselves from their app.
        //
        // $ifNull rather than a bare projection: a guest who has never set an
        // email has no such key on the document, and $project would omit the
        // field entirely rather than yielding null the way populate() did.
        // The edit form reads guestId.email, so the key must always exist.
        pipeline: [
          {
            $project: {
              name: 1,
              phone: 1,
              createdAt: 1,
              email: { $ifNull: ["$email", null] },
            },
          },
        ],
      },
    },
    { $unwind: "$guest" },
    ...(rx
      ? [{ $match: { $or: [{ "guest.name": rx }, { "guest.phone": rx }, { "guest.email": rx }] } }]
      : []),
    { $sort: { lastActivityAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        meta: [{ $count: "total" }],
      },
    },
  ]);

  return {
    // Remapped to guestId so the row shape is identical to the previous
    // .populate() output — the members table reads m.guestId.name and must
    // not have to change.
    items: (result?.items || []).map(({ guest, ...membership }) => ({
      ...membership,
      guestId: guest,
    })),
    total: result?.meta?.[0]?.total || 0,
    page,
    limit,
  };
};

export const listGuests = async ({
  q,
  hasBalance,
  joinedFrom,
  joinedTo,
  page = 1,
  limit = 25,
}) => {
  const match = { role: ROLES.GUEST };

  const rx = searchRegex(q);
  if (rx) match.$or = [{ name: rx }, { phone: rx }, { email: rx }];

  if (joinedFrom || joinedTo) {
    match.createdAt = {};
    if (joinedFrom) match.createdAt.$gte = new Date(joinedFrom);
    if (joinedTo) match.createdAt.$lte = new Date(joinedTo);
  }

  // One aggregation instead of 1 + N. The previous implementation ran a
  // separate GuestHotelMembership.find() per row — 25 extra round-trips for
  // every page of the admin's guest table. The $lookup sits INSIDE the facet,
  // after $skip/$limit, so it joins only the current page's rows.
  const [result] = await User.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: "guesthotelmemberships",
              localField: "_id",
              foreignField: "guestId",
              as: "memberships",
              pipeline: [
                { $project: { balance: 1, lifetimeEarned: 1, lifetimeRedeemed: 1 } },
              ],
            },
          },
          {
            $project: {
              id: "$_id",
              name: 1,
              isActive: 1,
              createdAt: 1,
              // Always present, even for guests who have set neither.
              phone: { $ifNull: ["$phone", null] },
              email: { $ifNull: ["$email", null] },
              hotels: { $size: "$memberships" },
              balance: { $sum: "$memberships.balance" },
              lifetimeEarned: { $sum: "$memberships.lifetimeEarned" },
              lifetimeRedeemed: { $sum: "$memberships.lifetimeRedeemed" },
            },
          },
          ...(hasBalance ? [{ $match: { balance: { $gt: 0 } } }] : []),
        ],
        meta: [{ $count: "total" }],
      },
    },
  ]);

  return {
    items: result?.items || [],
    total: result?.meta?.[0]?.total || 0,
    page,
    limit,
  };
};
