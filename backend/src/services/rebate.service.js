import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { TX_TYPES } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { Hotel } from "../models/hotel.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { RebateSettlement } from "../models/rebateSettlement.model.js";
import { getSettings } from "./settings.service.js";
import { emitToHotel } from "../realtime/emitter.js";

/**
 * The month-end redemption rebate.
 *
 * Guests redeem coins at a hotel; at the close of the month a share of those
 * coins (redemptionRebatePercent, 50 by default) is credited back to that
 * hotel's spendable inventory.
 *
 * Two properties this code exists to guarantee:
 *
 *  1. A period is settled AT MOST ONCE per hotel. The unique index on
 *     {hotelId, period} is the enforcement — the insert is attempted first and
 *     a duplicate-key error is treated as "already done", so two concurrent
 *     runs cannot both pay out.
 *
 *  2. The settlement and the inventory movement agree. Both happen inside one
 *     transaction, so a crash between them cannot leave a hotel credited with
 *     no record, or a record with no credit.
 */

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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

/**
 * Coins redeemed per hotel in the window.
 *
 * REDEEM rows store `coins` negative, so they are summed as absolute values.
 * Only hotels with redemptions come back — a hotel with none has nothing to
 * settle and must not get a zero-coin row.
 */
export const redeemedByHotel = async ({ periodStart, periodEnd, hotelId = null }) => {
  const match = {
    type: TX_TYPES.REDEEM,
    createdAt: { $gte: periodStart, $lt: periodEnd },
  };
  if (hotelId) match.hotelId = new mongoose.Types.ObjectId(String(hotelId));

  return CoinTransaction.aggregate([
    { $match: match },
    { $group: { _id: "$hotelId", coinsRedeemed: { $sum: { $abs: "$coins" } } } },
    { $match: { coinsRedeemed: { $gt: 0 } } },
  ]);
};

/**
 * Coins are whole units, so the credit is floored. Flooring rather than
 * rounding keeps the platform from ever paying out more than the agreed share.
 */
export const computeRebate = (coinsRedeemed, ratePercent) =>
  Math.floor((coinsRedeemed * ratePercent) / 100);

/**
 * Settles one hotel for one period. Returns null when there is nothing to do,
 * so callers can distinguish "skipped" from "credited".
 */
const settleHotel = async ({ hotelId, coinsRedeemed, period, range, ratePercent, runBy }) => {
  const coinsCredited = computeRebate(coinsRedeemed, ratePercent);

  // A rate of 0, or a redemption total small enough to floor to nothing, means
  // no inventory moves — and no settlement row, so the month stays open if the
  // rate is corrected and the job re-run.
  if (coinsCredited <= 0) return null;

  const session = await mongoose.startSession();
  let outcome = null;

  try {
    await session.withTransaction(async () => {
      // Claim the period FIRST. If a concurrent run already has it, this throws
      // a duplicate-key error and the transaction aborts before any coins move.
      const [settlement] = await RebateSettlement.create(
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
          },
        ],
        { session }
      );

      const hotel = await Hotel.findOneAndUpdate(
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
        period,
        coinsRedeemed,
        ratePercent,
        coinsCredited,
        coinInventory: hotel.coinInventory,
      };
    });
  } catch (err) {
    // 11000 = duplicate key: this hotel-month is already settled. That is the
    // normal outcome of a re-run, not a failure.
    if (err?.code === 11000) return null;
    throw err;
  } finally {
    await session.endSession();
  }

  if (outcome) {
    emitToHotel(hotelId, "hotel:inventory", { coinInventory: outcome.coinInventory });
  }

  return outcome;
};

/**
 * Runs the rebate for every hotel with redemptions in `period`.
 *
 * Safe to call repeatedly: hotels already settled for the period are skipped.
 * `dryRun` reports what would happen and writes nothing.
 */
export const runMonthlyRebate = async ({
  period = previousPeriod(),
  hotelId = null,
  runBy = null,
  dryRun = false,
} = {}) => {
  const range = periodRange(period);

  // Settling a month that has not finished would credit a partial total and
  // then lock the period, so the rest of the month could never be paid.
  if (range.periodEnd > new Date()) {
    throw new ApiError(
      400,
      `Period ${period} has not finished yet. It can be settled from ${localDate(range.periodEnd)}.`
    );
  }

  // Read past the cache: this pays real coins out, so it must use the rate as
  // it stands right now, not one up to a cache-TTL old.
  const settings = await getSettings({ fresh: true });
  const ratePercent = settings.redemptionRebatePercent ?? 50;

  const rows = await redeemedByHotel({ ...range, hotelId });

  const results = [];
  let skipped = 0;

  for (const row of rows) {
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

  const totalCredited = results.reduce((sum, r) => sum + r.coinsCredited, 0);

  logger.info(
    `[REBATE] ${dryRun ? "[DRY] " : ""}${period}: credited ${results.length} hotel(s) ` +
      `${totalCredited} coins, skipped ${skipped}`
  );

  return { period, ratePercent, dryRun, settled: results, skipped, totalCredited };
};

/** Settlement history, newest first. Scoped to one hotel for the hotel panel. */
export const listSettlements = async ({ hotelId = null, limit = 24 } = {}) => {
  const query = hotelId ? { hotelId } : {};
  return RebateSettlement.find(query)
    .populate("hotelId", "name slug")
    .sort({ period: -1, createdAt: -1 })
    .limit(limit);
};
