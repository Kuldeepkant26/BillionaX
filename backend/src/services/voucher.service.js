import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { VOUCHER_STATUS, TX_TYPES } from "../config/constants.js";
import { generateVoucherCode, normalizeVoucherCode } from "../utils/voucherCode.util.js";
import { computeRedemption, computePlatformFee } from "../utils/coinMath.js";
import { Voucher } from "../models/voucher.model.js";
import { Hotel } from "../models/hotel.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { getSettings } from "./settings.service.js";
import { pushLedgerEvent } from "./notification.service.js";
import { emitToGuest, emitToHotel } from "../realtime/emitter.js";

const tierCapFor = (hotel, tier) => hotel?.tierCaps?.[tier] ?? 0;

/** Issues a one-time code for the guest to show at the desk. */
export const issueVoucher = async ({ guestId, hotelId, coins }) => {
  const settings = await getSettings();

  const membership = await GuestHotelMembership.findOne({ guestId, hotelId });
  if (!membership) throw new ApiError(404, "You are not a member at this hotel");
  if (membership.balance <= 0) throw new ApiError(400, "You have no coins to redeem here");

  const coinsRequested = Math.min(coins, membership.balance);
  if (!(coinsRequested > 0)) throw new ApiError(400, "Enter how many coins to use");

  // One live voucher per guest per hotel — cancel any previous one.
  await Voucher.updateMany(
    { guestId, hotelId, status: VOUCHER_STATUS.ACTIVE },
    { $set: { status: VOUCHER_STATUS.CANCELLED } }
  );

  const expiresAt = new Date(Date.now() + settings.voucherTtlMinutes * 60_000);

  // Retry on the astronomically unlikely code collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const voucher = await Voucher.create({
        code: generateVoucherCode(),
        guestId,
        hotelId,
        membershipId: membership._id,
        coinsRequested,
        expiresAt,
      });
      return voucher;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  throw new ApiError(500, "Could not generate a voucher code, please try again");
};

/**
 * Read-only preview for staff. Deliberately does NOT mutate the voucher —
 * a mistyped code must never burn a guest's voucher.
 */
export const verifyVoucher = async ({ code, hotelId, billAmount }) => {
  const voucher = await Voucher.findOne({
    code: normalizeVoucherCode(code),
    hotelId,
  }).populate("guestId", "name phone");

  if (!voucher) throw new ApiError(404, "That code was not found at this hotel");
  if (voucher.status === VOUCHER_STATUS.REDEEMED) {
    throw new ApiError(400, "This code has already been used");
  }
  if (voucher.status === VOUCHER_STATUS.CANCELLED) {
    throw new ApiError(400, "This code was cancelled");
  }
  if (voucher.expiresAt <= new Date()) throw new ApiError(400, "This code has expired");

  const [settings, hotel, membership] = await Promise.all([
    getSettings(),
    Hotel.findById(hotelId),
    GuestHotelMembership.findById(voucher.membershipId),
  ]);

  const tierCapPercent = tierCapFor(hotel, membership.tier);

  const preview =
    billAmount > 0
      ? computeRedemption({
          coinsRequested: voucher.coinsRequested,
          balance: membership.balance,
          billAmount,
          tierCapPercent,
        })
      : null;

  return {
    voucher: {
      id: voucher._id,
      code: voucher.code,
      coinsRequested: voucher.coinsRequested,
      expiresAt: voucher.expiresAt,
    },
    guest: {
      id: voucher.guestId._id,
      name: voucher.guestId.name,
      phone: voucher.guestId.phone,
    },
    membership: {
      memberNo: membership.memberNo,
      tier: membership.tier,
      balance: membership.balance,
      tierCapPercent,
    },
    preview,
    settings: { platformFeePercent: settings.platformFeePercent },
  };
};

/**
 * Applies the voucher to a bill.
 *
 * Spans three documents (voucher, membership, ledger), so it runs inside a
 * transaction: if the membership debit failed after the voucher was claimed,
 * the guest would lose both the voucher and the discount.
 */
export const redeemVoucher = async ({
  code,
  hotelId,
  billAmount,
  outlet,
  performedBy,
  idempotencyKey,
}) => {
  const settings = await getSettings();
  const normalizedCode = normalizeVoucherCode(code);

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      // Claim the voucher first — the status flip is the mutex that makes the
      // code single-use under concurrency.
      const voucher = await Voucher.findOneAndUpdate(
        {
          code: normalizedCode,
          hotelId,
          status: VOUCHER_STATUS.ACTIVE,
          expiresAt: { $gt: new Date() },
        },
        {
          $set: {
            status: VOUCHER_STATUS.REDEEMED,
            redeemedAt: new Date(),
            redeemedBy: performedBy,
          },
        },
        { new: true, session }
      );

      if (!voucher) {
        throw new ApiError(400, "This code is invalid, already used, or expired");
      }

      const [hotel, membership] = await Promise.all([
        Hotel.findById(hotelId).session(session),
        GuestHotelMembership.findById(voucher.membershipId).session(session),
      ]);

      const tierCapPercent = tierCapFor(hotel, membership.tier);
      const { coinsApplied, cashPayable, capByBill } = computeRedemption({
        coinsRequested: voucher.coinsRequested,
        balance: membership.balance,
        billAmount,
        tierCapPercent,
      });

      if (coinsApplied <= 0) {
        throw new ApiError(
          400,
          `No coins could be applied to this bill (tier cap allows ${capByBill})`
        );
      }

      // Debit guarded by balance, so it can never go negative.
      const debited = await GuestHotelMembership.findOneAndUpdate(
        { _id: membership._id, balance: { $gte: coinsApplied } },
        {
          $inc: { balance: -coinsApplied, lifetimeRedeemed: coinsApplied },
          $set: { lastActivityAt: new Date() },
        },
        { new: true, session }
      );

      if (!debited) throw new ApiError(409, "Guest balance changed, please try again");

      const platformFee = computePlatformFee({
        cashPayable,
        feePercent: settings.platformFeePercent,
      });

      const [transaction] = await CoinTransaction.create(
        [
          {
            type: TX_TYPES.REDEEM,
            guestId: voucher.guestId,
            hotelId,
            membershipId: membership._id,
            coins: -coinsApplied,
            balanceAfter: debited.balance,
            voucherId: voucher._id,
            billAmount,
            cashPayable,
            outlet,
            platformFee,
            performedBy,
            idempotencyKey,
          },
        ],
        { session }
      );

      await Voucher.updateOne(
        { _id: voucher._id },
        { $set: { transactionId: transaction._id } },
        { session }
      );

      await Hotel.updateOne(
        { _id: hotelId },
        { $inc: { totalCoinsRedeemed: coinsApplied } },
        { session }
      );

      result = {
        code: voucher.code,
        coinsApplied,
        billAmount,
        cashPayable,
        platformFee,
        balanceAfter: debited.balance,
        transactionId: transaction._id,
        // Carried out of the transaction so the notification can be emitted
        // after it commits, without a second read.
        guestId: voucher.guestId,
        transactionDoc: transaction,
      };
    });
  } finally {
    await session.endSession();
  }

  // Emitted only after the transaction has fully committed and the session is
  // closed. withTransaction RETRIES on transient errors, so an emit inside the
  // callback would fire once per attempt — the guest would see notifications
  // for a redemption that was rolled back.
  if (result) {
    await pushLedgerEvent({ guestId: result.guestId, transaction: result.transactionDoc });
    emitToGuest(result.guestId, "balance:changed", {
      hotelId,
      balance: result.balanceAfter,
      delta: -result.coinsApplied,
    });
    emitToGuest(result.guestId, "voucher:redeemed", {
      code: result.code,
      coinsApplied: result.coinsApplied,
      cashPayable: result.cashPayable,
      balanceAfter: result.balanceAfter,
    });
    emitToHotel(hotelId, "hotel:transaction", {
      type: TX_TYPES.REDEEM,
      coins: -result.coinsApplied,
      createdAt: new Date(),
    });
  }

  return result;
};

export const getActiveVoucher = async ({ guestId, hotelId }) =>
  Voucher.findOne({
    guestId,
    hotelId,
    status: VOUCHER_STATUS.ACTIVE,
    expiresAt: { $gt: new Date() },
  });

export const cancelVoucher = async ({ voucherId, guestId }) => {
  const voucher = await Voucher.findOneAndUpdate(
    { _id: voucherId, guestId, status: VOUCHER_STATUS.ACTIVE },
    { $set: { status: VOUCHER_STATUS.CANCELLED } },
    { new: true }
  );
  if (!voucher) throw new ApiError(404, "No active voucher to cancel");
  return voucher;
};
