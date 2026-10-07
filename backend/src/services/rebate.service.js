import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { TX_TYPES, PURCHASE_STATUS } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { CoinPurchase } from "../models/coinPurchase.model.js";
import { RebateSettlement } from "../models/rebateSettlement.model.js";
import { RebateRun, REBATE_RUN_STATUS } from "../models/rebateRun.model.js";
import { getSettings } from "./settings.service.js";
import { emailEnabled, sendEmail } from "./email.service.js";
import { rebateCreditedEmailTemplate } from "./emailTemplates.js";
import { emitToHotel } from "../realtime/emitter.js";

/**
 * The month-end redemption rebate — "coin distribution" in the admin panel.
 *
 * Guests redeem coins at a hotel; at the close of the month a share of those
 * coins (redemptionRebatePercent, 50 by default) is credited back to that
 * hotel's spendable inventory.
 *
 * Three properties this code exists to guarantee:
 *
 *  1. A MONTH is distributed at most once. RebateRun's unique `period` is the
 *     enforcement: the run is claimed before any coins move, and a second
 *     attempt at a completed month is refused outright.
 *
 *  2. A HOTEL is settled at most once per period. The unique index on
 *     RebateSettlement {hotelId, period} is the enforcement — the insert is
 *     attempted first and a duplicate-key error is treated as "already done",
 *     so a resumed run after a crash cannot pay anyone twice.
 *
 *  3. The settlement and the inventory movement agree. Both happen inside one
 *     transaction, so a crash between them cannot leave a hotel credited with
 *     no record, or a record with no credit.
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * How long a RUNNING claim is honoured before another attempt may take it
 * over. A real run settles each hotel in milliseconds, so ten minutes of
 * silence means the process that claimed it is gone, not slow.
 */
export const STALE_RUN_MS = 10 * 60 * 1000;

/** How far back the hotel panel looks for a payout it has not announced. */
const UNSEEN_WINDOW_DAYS = 62;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Local calendar date as YYYY-MM-DD.
 *
 * NOT toISOString(): that converts to UTC first, so local midnight in any
 * positive offset (IST included) renders as the PREVIOUS day. Every boundary
 * here is built with local-time Date constructors, so it must be formatted in
 * local time too.
 */
const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** "2026-08" -> the half-open window [2026-08-01, 2026-09-01). */
export const periodRange = (period) => {
  if (!PERIOD_RE.test(String(period))) {
    throw new ApiError(400, `Period must look like "2026-08", got "${period}"`);
  }

  const [year, month] = String(period).split("-").map(Number);

  // Half-open on purpose: an inclusive end date would either miss redemptions
  // in the last second of the month or double-count the first of the next.
  // Month 12 rolls the year over correctly because Date takes month 12 as
  // January of the following year.
  return {
    periodStart: new Date(year, month - 1, 1, 0, 0, 0, 0),
    periodEnd: new Date(year, month, 1, 0, 0, 0, 0),
  };
};

/** The calendar month before the one containing `ref`. The usual target. */
export const previousPeriod = (ref = new Date()) => {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const currentPeriod = (ref = new Date()) =>
  `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;

/** "2026-09" -> "September 2026". Fixed names, so it never depends on ICU. */
export const periodLabel = (period) => {
  const [year, month] = String(period).split("-").map(Number);
  return `${MONTH_NAMES[month - 1] || "?"} ${year}`;
};

/**
 * Coins redeemed per hotel in the window.
 *
 * REDEEM rows store `coins` negative, so they are summed as absolute values.
 * Only hotels with redemptions come back — a hotel with none has nothing to
 * settle and must not get a zero-coin row.
 */
export const redeemedByHotel = async ({ periodStart, periodEnd }) =>
  CoinTransaction.aggregate([
    {
      $match: {
        type: TX_TYPES.REDEEM,
        createdAt: { $gte: periodStart, $lt: periodEnd },
        // Demo redemptions must never be settled: this credits REAL coin
        // inventory to a hotel, and a demonstration would otherwise pay them
        // for it. `$ne: true` because rows written before demo mode existed
        // have no field.
        isDemo: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$hotelId",
        coinsRedeemed: { $sum: { $abs: "$coins" } },
        bills: { $sum: 1 },
      },
    },
    { $match: { coinsRedeemed: { $gt: 0 } } },
  ]);

/**
 * Coins each hotel bought from the platform in the window. Informational — it
 * plays no part in the payout, but it is the other half of the picture the
 * admin wants to see next to what guests redeemed.
 */
const purchasedByHotel = async ({ periodStart, periodEnd }) =>
  CoinPurchase.aggregate([
    {
      $match: {
        status: PURCHASE_STATUS.COMPLETED,
        createdAt: { $gte: periodStart, $lt: periodEnd },
      },
    },
    { $group: { _id: "$hotelId", coinsPurchased: { $sum: "$coins" }, purchases: { $sum: 1 } } },
  ]);

/**
 * Coins are whole units, so the credit is floored. Flooring rather than
 * rounding keeps the platform from ever paying out more than the agreed share.
 */
export const computeRebate = (coinsRedeemed, ratePercent) =>
  Math.floor((coinsRedeemed * ratePercent) / 100);

/**
 * Why a distribution may NOT start, or null when it may.
 *
 * Pure, so every rule is pinned by tests without a database. Called twice per
 * run: once up front with the row as read, and again after a lost claim race
 * to explain to the loser what the winner left behind.
 *
 * `expectedRatePercent` is the rate the admin was LOOKING AT when they
 * confirmed. If another admin changed the setting in between, the coins about
 * to move are not the coins that were confirmed, so the run is refused rather
 * than quietly paid at a rate nobody approved.
 */
export const runBlocker = ({ period, existingRun, ratePercent, expectedRatePercent, now = new Date() }) => {
  const label = periodLabel(period);

  if (existingRun?.status === REBATE_RUN_STATUS.COMPLETE) {
    return { status: 409, message: `Coins for ${label} have already been distributed` };
  }

  if (
    existingRun?.status === REBATE_RUN_STATUS.RUNNING &&
    now - new Date(existingRun.startedAt) < STALE_RUN_MS
  ) {
    return { status: 409, message: `The distribution for ${label} is already in progress` };
  }

  if (!(ratePercent > 0)) {
    return { status: 400, message: "Set a payout rate above 0% before distributing" };
  }

  if (expectedRatePercent != null && Number(expectedRatePercent) !== Number(ratePercent)) {
    return {
      status: 409,
      message: `The payout rate was just changed to ${ratePercent}%. Review the figures and try again.`,
    };
  }

  return null;
};

/**
 * Claims the month for this run, before a single coin moves.
 *
 * The insert IS the lock. On a duplicate, a RUNNING row whose owner has gone
 * quiet for STALE_RUN_MS is taken over atomically — the filter on startedAt
 * means two rescuers racing cannot both win. Anything else is refused with
 * the reason runBlocker gives.
 */
const claimRun = async ({ period, ratePercent, runBy }) => {
  const now = new Date();

  try {
    return await RebateRun.create({
      period,
      ratePercent,
      status: REBATE_RUN_STATUS.RUNNING,
      startedAt: now,
      runBy: runBy || null,
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  const taken = await RebateRun.findOneAndUpdate(
    {
      period,
      status: REBATE_RUN_STATUS.RUNNING,
      startedAt: { $lt: new Date(now.getTime() - STALE_RUN_MS) },
    },
    { $set: { startedAt: now, ratePercent, runBy: runBy || null } },
    { new: true }
  );
  if (taken) {
    logger.warn(`[REBATE] ${period}: took over a stale run — resuming`);
    return taken;
  }

  const existingRun = await RebateRun.findOne({ period }).lean();
  const blocked = runBlocker({ period, existingRun, ratePercent, now });
  throw new ApiError(blocked?.status || 409, blocked?.message || "This month is already being distributed");
};

/**
 * Tells the hotel by email. Called AFTER the settlement has committed and
 * never awaited by the run: the coins have already moved, so a slow or failing
 * mail provider must neither hold up the next hotel nor undo this one.
 */
const emailHotel = async ({ hotel, outcome }) => {
  if (!hotel?.email || !emailEnabled()) return;

  const n = (v) => Number(v).toLocaleString("en-IN");
  const label = periodLabel(outcome.period);
  const { text, html } = rebateCreditedEmailTemplate({
    hotelName: hotel.name,
    periodLabel: label,
    coinsCredited: n(outcome.coinsCredited),
    coinsRedeemed: n(outcome.coinsRedeemed),
    ratePercent: outcome.ratePercent,
    coinInventory: n(outcome.coinInventory),
  });

  await sendEmail({
    to: hotel.email,
    subject: `+${n(outcome.coinsCredited)} coins — your ${label} payout has arrived`,
    html,
    text,
  });
};

/** The live announcement's payload. Shared by the push and the unseen list. */
const toNotice = (settlement, coinInventory) => ({
  id: String(settlement._id),
  period: settlement.period,
  periodLabel: periodLabel(settlement.period),
  coinsRedeemed: settlement.coinsRedeemed,
  ratePercent: settlement.ratePercent,
  coinsCredited: settlement.coinsCredited,
  coinInventory,
  createdAt: settlement.createdAt,
});

/**
 * Settles one hotel for one period. Returns null when there is nothing to do,
 * so callers can distinguish "skipped" from "credited".
 */
const settleHotel = async ({ hotelId, coinsRedeemed, period, range, ratePercent, runBy }) => {
  const coinsCredited = computeRebate(coinsRedeemed, ratePercent);

  // A redemption total small enough to floor to nothing means no inventory
  // moves — and no settlement row, since there is nothing to record.
  if (coinsCredited <= 0) return null;

  const session = await mongoose.startSession();
  let outcome = null;
  let hotel = null;
  let settlement = null;

  try {
    await session.withTransaction(async () => {
      // Claim the period FIRST. If a concurrent run already has it, this throws
      // a duplicate-key error and the transaction aborts before any coins move.
      [settlement] = await RebateSettlement.create(
        [
          {
            hotelId,
            period,
            periodStart: range.periodStart,
            periodEnd: range.periodEnd,
            coinsRedeemed,
            ratePercent,
            coinsCredited,
            runBy: runBy || null,
            seenAt: null,
          },
        ],
        { session }
      );

      hotel = await Hotel.findOneAndUpdate(
        { _id: hotelId },
        { $inc: { coinInventory: coinsCredited } },
        { new: true, session }
      );

      if (!hotel) throw new ApiError(404, "Hotel not found");

      const [transaction] = await CoinTransaction.create(
        [
          {
            type: TX_TYPES.REBATE,
            hotelId,
            coins: coinsCredited,
            // This row moves HOTEL inventory, not any guest's balance, so there
            // is no membership balance to snapshot. The hotel's resulting
            // inventory is recorded instead — the field is required, and this
            // is the only meaningful "after" for a rebate.
            balanceAfter: hotel.coinInventory,
            note: `Month-end rebate for ${period}: ${ratePercent}% of ${coinsRedeemed} coins redeemed`,
            performedBy: runBy || null,
            // Belt and braces alongside the settlement's unique index: even a
            // direct call cannot write two ledger rows for one hotel-month.
            idempotencyKey: `rebate:${hotelId}:${period}`,
          },
        ],
        { session }
      );

      await RebateSettlement.updateOne(
        { _id: settlement._id },
        { $set: { transactionId: transaction._id } },
        { session }
      );

      outcome = {
        hotelId,
        hotelName: hotel.name,
        settlementId: settlement._id,
        period,
        coinsRedeemed,
        ratePercent,
        coinsCredited,
        coinInventory: hotel.coinInventory,
      };
    });
  } catch (err) {
    // 11000 = duplicate key: this hotel-month is already settled. That is the
    // normal outcome of a resumed run, not a failure.
    if (err?.code === 11000) return null;
    throw err;
  } finally {
    await session.endSession();
  }

  if (outcome) {
    emitToHotel(hotelId, "hotel:inventory", { coinInventory: outcome.coinInventory });
    // The hotel panel's "coins received" moment. Sent to the hotel room, which
    // every staff socket of that property sits in; the panel shows it to the
    // manager, who is the one who can act on inventory.
    emitToHotel(hotelId, "rebate:credited", {
      notice: toNotice(settlement, outcome.coinInventory),
    });
    emailHotel({ hotel, outcome }).catch((err) =>
      logger.warn(`[REBATE] email to hotel ${hotelId} failed: ${err.message}`)
    );
  }

  return outcome;
};

/** Sums what was ACTUALLY settled for a period, across every run of it. */
const settledTotals = async (period) => {
  const [row] = await RebateSettlement.aggregate([
    { $match: { period } },
    {
      $group: {
        _id: null,
        hotels: { $sum: 1 },
        coinsRedeemed: { $sum: "$coinsRedeemed" },
        coinsCredited: { $sum: "$coinsCredited" },
      },
    },
  ]);
  return {
    hotelsCredited: row?.hotels || 0,
    coinsRedeemed: row?.coinsRedeemed || 0,
    coinsCredited: row?.coinsCredited || 0,
  };
};

/**
 * Distributes `period` to every hotel with redemptions in it.
 *
 * Once per month: a completed period is refused. A run that died part-way can
 * be resumed (immediately if it failed cleanly, after STALE_RUN_MS if the
 * process vanished) and pays only the hotels it had not reached.
 *
 * `dryRun` reports what would happen and writes nothing — no claim either.
 */
export const runMonthlyRebate = async ({
  period = previousPeriod(),
  runBy = null,
  dryRun = false,
  expectedRatePercent = null,
} = {}) => {
  const range = periodRange(period);

  // Settling a month that has not finished would credit a partial total and
  // then lock the period, so the rest of the month could never be paid.
  if (range.periodEnd > new Date()) {
    throw new ApiError(
      400,
      `${periodLabel(period)} has not finished yet. It can be distributed from ${localDate(range.periodEnd)}.`
    );
  }

  // Read past the cache: this pays real coins out, so it must use the rate as
  // it stands right now, not one up to a cache-TTL old.
  const settings = await getSettings({ fresh: true });
  const ratePercent = settings.redemptionRebatePercent ?? 50;

  let run = null;
  if (!dryRun) {
    const existingRun = await RebateRun.findOne({ period }).lean();
    const blocked = runBlocker({ period, existingRun, ratePercent, expectedRatePercent });
    if (blocked) throw new ApiError(blocked.status, blocked.message);

    // Re-checked by the insert itself — the read above only gives a clear
    // message in the common case; the claim is what closes the race.
    run = await claimRun({ period, ratePercent, runBy });
  }

  const results = [];
  let skipped = 0;

  try {
    const rows = await redeemedByHotel(range);

    // Hotels are hard-deleted, but their ledger rows are kept as the audit
    // trail. A deleted hotel's redemptions therefore still aggregate, and
    // settling one would throw "Hotel not found" and abort the whole month for
    // everyone else. There is nobody left to pay, so they are skipped.
    const live = new Set(
      (await Hotel.find({ _id: { $in: rows.map((r) => r._id) } }).select("_id").lean()).map((h) =>
        String(h._id)
      )
    );

    for (const row of rows) {
      if (!live.has(String(row._id))) {
        logger.warn(`[REBATE] ${period}: hotel ${row._id} no longer exists — skipped`);
        skipped += 1;
        continue;
      }

      if (dryRun) {
        const already = await RebateSettlement.exists({ hotelId: row._id, period });
        if (already) {
          skipped += 1;
          continue;
        }
        results.push({
          hotelId: row._id,
          period,
          coinsRedeemed: row.coinsRedeemed,
          ratePercent,
          coinsCredited: computeRebate(row.coinsRedeemed, ratePercent),
        });
        continue;
      }

      const settled = await settleHotel({
        hotelId: row._id,
        coinsRedeemed: row.coinsRedeemed,
        period,
        range,
        ratePercent,
        runBy,
      });

      if (settled) results.push(settled);
      else skipped += 1;
    }
  } catch (err) {
    // Release the claim so the admin can simply press the button again.
    // Hotels already paid stay paid, and the retry skips them by their own
    // unique index — releasing is what makes "try again" safe AND immediate.
    if (run) {
      await RebateRun.deleteOne({ _id: run._id, status: REBATE_RUN_STATUS.RUNNING }).catch(() => {});
    }
    throw err;
  }

  if (run) {
    // From the settlements, not from `results`: a resumed run only sees the
    // hotels it paid itself, and the month's record must cover all of them.
    const totals = await settledTotals(period);
    run = await RebateRun.findOneAndUpdate(
      { _id: run._id },
      { $set: { ...totals, status: REBATE_RUN_STATUS.COMPLETE, completedAt: new Date() } },
      { new: true }
    );
  }

  const totalCredited = results.reduce((sum, r) => sum + r.coinsCredited, 0);

  logger.info(
    `[REBATE] ${dryRun ? "[DRY] " : ""}${period}: credited ${results.length} hotel(s) ` +
      `${totalCredited} coins, skipped ${skipped}`
  );

  return { period, ratePercent, dryRun, settled: results, skipped, totalCredited, run };
};

/** Settlement history, newest first. Scoped to one hotel for the hotel panel. */
export const listSettlements = async ({ hotelId = null, limit = 24 } = {}) => {
  const query = hotelId ? { hotelId } : {};
  return RebateSettlement.find(query)
    .populate("hotelId", "name slug")
    .sort({ period: -1, createdAt: -1 })
    .limit(limit);
};

/**
 * Where a month stands, for the admin's distribution tab.
 *
 *   OPEN      the month has not finished — nothing may be distributed yet
 *   EMPTY     finished, but no guest redeemed anything, so nothing to pay
 *   READY     finished, redemptions to pay, not yet distributed
 *   RUNNING   a run holds the month right now
 *   COMPLETE  distributed — the button is gone for this month
 */
export const distributionState = ({ isClosed, run, coinsRedeemed }) => {
  if (run?.status === REBATE_RUN_STATUS.COMPLETE) return "COMPLETE";
  if (run?.status === REBATE_RUN_STATUS.RUNNING) return "RUNNING";
  if (!isClosed) return "OPEN";
  return coinsRedeemed > 0 ? "READY" : "EMPTY";
};

/**
 * Everything the distribution tab shows for one month: per-hotel coins bought
 * and redeemed, what each would receive (or did), and the month's status.
 *
 * `projectedCredit` uses the CURRENT rate. Once a hotel is settled its row
 * carries the settlement instead, whose rate is frozen — the two are kept in
 * separate fields so the UI can never show a forecast as a fact.
 */
export const distributionOverview = async ({ period, now = new Date() } = {}) => {
  const target = period || previousPeriod(now);
  const range = periodRange(target);
  const isClosed = range.periodEnd <= now;

  const [settings, redeemed, purchased, settlements, run, history] = await Promise.all([
    getSettings({ fresh: true }),
    redeemedByHotel(range),
    purchasedByHotel(range),
    RebateSettlement.find({ period: target }).lean(),
    RebateRun.findOne({ period: target }).populate({ path: "runBy", select: "name", model: User }).lean(),
    RebateRun.find({ status: REBATE_RUN_STATUS.COMPLETE })
      .sort({ period: -1 })
      .limit(12)
      .populate({ path: "runBy", select: "name", model: User })
      .lean(),
  ]);

  const ratePercent = settings.redemptionRebatePercent ?? 50;

  const byHotel = new Map();
  const slot = (id) => {
    const key = String(id);
    if (!byHotel.has(key)) {
      byHotel.set(key, { hotelId: key, coinsPurchased: 0, purchases: 0, coinsRedeemed: 0, bills: 0 });
    }
    return byHotel.get(key);
  };

  for (const r of redeemed) Object.assign(slot(r._id), { coinsRedeemed: r.coinsRedeemed, bills: r.bills });
  for (const p of purchased) {
    Object.assign(slot(p._id), { coinsPurchased: p.coinsPurchased, purchases: p.purchases });
  }
  for (const s of settlements) slot(s.hotelId).settlement = s;

  const hotels = await Hotel.find({ _id: { $in: [...byHotel.keys()] } })
    .select("name city logoUrl coinInventory")
    .lean();
  const hotelById = new Map(hotels.map((h) => [String(h._id), h]));

  const rows = [...byHotel.values()]
    // A deleted hotel cannot be paid and has no name to show; see the same
    // filter in runMonthlyRebate.
    .filter((r) => hotelById.has(r.hotelId))
    .map((r) => {
      const h = hotelById.get(r.hotelId);
      const s = r.settlement;
      return {
        hotelId: r.hotelId,
        name: h.name,
        city: h.city || null,
        logoUrl: h.logoUrl || null,
        coinInventory: h.coinInventory || 0,
        coinsPurchased: r.coinsPurchased,
        purchases: r.purchases,
        coinsRedeemed: r.coinsRedeemed,
        bills: r.bills,
        projectedCredit: computeRebate(r.coinsRedeemed, ratePercent),
        settlement: s
          ? {
              id: String(s._id),
              coinsCredited: s.coinsCredited,
              ratePercent: s.ratePercent,
              createdAt: s.createdAt,
              seenAt: s.seenAt || null,
            }
          : null,
      };
    })
    .sort((a, b) => b.coinsRedeemed - a.coinsRedeemed || b.coinsPurchased - a.coinsPurchased);

  const totals = rows.reduce(
    (acc, r) => ({
      coinsPurchased: acc.coinsPurchased + r.coinsPurchased,
      coinsRedeemed: acc.coinsRedeemed + r.coinsRedeemed,
      bills: acc.bills + r.bills,
      projectedCredit: acc.projectedCredit + (r.settlement ? 0 : r.projectedCredit),
      coinsCredited: acc.coinsCredited + (r.settlement?.coinsCredited || 0),
    }),
    { coinsPurchased: 0, coinsRedeemed: 0, bills: 0, projectedCredit: 0, coinsCredited: 0 }
  );

  const summariseRun = (r) =>
    r && {
      period: r.period,
      periodLabel: periodLabel(r.period),
      status: r.status,
      ratePercent: r.ratePercent,
      hotelsCredited: r.hotelsCredited,
      coinsRedeemed: r.coinsRedeemed,
      coinsCredited: r.coinsCredited,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
      runBy: r.runBy?.name || null,
    };

  return {
    period: target,
    periodLabel: periodLabel(target),
    // The month the tab opens on when no period is asked for — the server's
    // idea of "last month", so a browser in another timezone cannot disagree.
    defaultPeriod: previousPeriod(now),
    isClosed,
    availableFrom: localDate(range.periodEnd),
    ratePercent,
    state: distributionState({ isClosed, run, coinsRedeemed: totals.coinsRedeemed }),
    run: summariseRun(run),
    rows,
    totals,
    history: history.map(summariseRun),
  };
};

/**
 * Whether last month is waiting to be distributed — the nav badge. One
 * indexed aggregation and one point read, cheap enough to ask on every
 * admin-panel load.
 */
export const distributionPending = async ({ now = new Date() } = {}) => {
  const period = previousPeriod(now);
  const run = await RebateRun.findOne({ period, status: REBATE_RUN_STATUS.COMPLETE })
    .select("_id")
    .lean();
  if (run) return { period, pending: false };

  const [any] = await redeemedByHotel(periodRange(period));
  return { period, pending: Boolean(any) };
};

/**
 * Payouts this hotel's manager has not been shown yet, oldest first, so they
 * are announced in the order they happened. Bounded by UNSEEN_WINDOW_DAYS: a
 * manager returning after a long absence wants the recent news, not a queue.
 */
export const listUnseenForHotel = async (hotelId) => {
  const since = new Date(Date.now() - UNSEEN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [rows, hotel] = await Promise.all([
    RebateSettlement.find({
      hotelId,
      seenAt: { $type: "null" },
      createdAt: { $gte: since },
    })
      .sort({ createdAt: 1 })
      .limit(6)
      .lean(),
    Hotel.findById(hotelId).select("coinInventory").lean(),
  ]);

  return rows.map((s) => toNotice(s, hotel?.coinInventory ?? null));
};

/** Scoped by hotelId in the filter, so one hotel cannot dismiss another's. */
export const markSeen = async ({ hotelId, settlementId }) => {
  const res = await RebateSettlement.updateOne(
    { _id: settlementId, hotelId, seenAt: { $type: "null" } },
    { $set: { seenAt: new Date() } }
  );
  return { updated: res.modifiedCount > 0 };
};
