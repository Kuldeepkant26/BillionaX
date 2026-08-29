import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { User } from "../models/user.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { Voucher } from "../models/voucher.model.js";
import { Notification } from "../models/notification.model.js";
import { NotificationState } from "../models/notificationState.model.js";
import { ContentLike } from "../models/contentLike.model.js";
import { ContentComment } from "../models/contentComment.model.js";

/**
 * Folds a staff-created guest account into the account the guest actually signs
 * into.
 *
 * Why this exists: guests sign in with an email address, but hotel staff award
 * coins by typing a PHONE NUMBER at checkout, which creates a guest record on
 * the spot if that number is unknown (see allocateCoins). So a guest who earns
 * coins before adding their number ends up with two rows — the one they log
 * into, and one holding their coins that nobody can reach.
 *
 * Linking the phone is the moment those two are known to be the same person,
 * so it is the moment they are merged.
 *
 * Only ever absorbs a "shell": an account with no email and no login history.
 * A source that someone has actually signed into is a different person who
 * happens to have typed this number, and merging it would hand one guest's
 * balance to another.
 */

/** A shell has never been logged into and holds no competing identity. */
const isAbsorbableShell = (user) =>
  user.role === ROLES.GUEST && !user.email && !user.lastLoginAt;

/**
 * Memberships are the one collection that cannot simply be re-pointed: both
 * accounts may hold one at the SAME hotel, and {guestId, hotelId} is unique.
 * Overlapping pairs are summed into the target; the rest move across.
 */
const mergeMemberships = async (sourceId, targetId, session) => {
  const sourceMemberships = await GuestHotelMembership.find({ guestId: sourceId }).session(session);
  let coinsMoved = 0;

  for (const source of sourceMemberships) {
    const existing = await GuestHotelMembership.findOne({
      guestId: targetId,
      hotelId: source.hotelId,
    }).session(session);

    coinsMoved += source.balance;

    if (!existing) {
      // No clash — hand the row over as it stands, keeping its member number
      // and join date.
      await GuestHotelMembership.updateOne(
        { _id: source._id },
        { $set: { guestId: targetId } },
        { session }
      );
      continue;
    }

    // Both accounts are members of this hotel: add the totals up. Tier is
    // recomputed from nights by the existing tier logic, so it is left alone
    // here rather than guessed at.
    await GuestHotelMembership.updateOne(
      { _id: existing._id },
      {
        $inc: {
          balance: source.balance,
          lifetimeNights: source.lifetimeNights,
          lifetimeSpend: source.lifetimeSpend,
          lifetimeEarned: source.lifetimeEarned,
          lifetimeRedeemed: source.lifetimeRedeemed,
        },
        $min: { joinedAt: source.joinedAt },
        $max: { lastActivityAt: source.lastActivityAt },
      },
      { session }
    );

    await GuestHotelMembership.deleteOne({ _id: source._id }, { session });
  }

  return coinsMoved;
};

/**
 * Re-points everything else the source owns. The ledger moves too — it is the
 * audit trail for coins a hotel paid for, so it must follow the balance rather
 * than be orphaned on a deleted account.
 */
const reassignOwnedRows = async (sourceId, targetId, session) => {
  const set = { $set: { guestId: targetId } };

  // No uniqueness on guestId in these — a straight bulk re-point is correct.
  // Comments in particular are many-per-guest; de-duplicating them would
  // silently delete things the guest actually wrote.
  await CoinTransaction.updateMany({ guestId: sourceId }, set, { session });
  await Voucher.updateMany({ guestId: sourceId }, set, { session });
  await Notification.updateMany({ guestId: sourceId }, set, { session });
  await ContentComment.updateMany({ guestId: sourceId }, set, { session });

  // ContentLike is unique on {guestId, contentId}: if the target already liked
  // the same post, re-pointing would violate it. A like is a boolean, so the
  // duplicate is simply dropped.
  const likes = await ContentLike.find({ guestId: sourceId }).session(session);
  for (const like of likes) {
    const clash = await ContentLike.exists({
      guestId: targetId,
      contentId: like.contentId,
    }).session(session);

    if (clash) await ContentLike.deleteOne({ _id: like._id }, { session });
    else await ContentLike.updateOne({ _id: like._id }, set, { session });
  }

  // Unique on guestId alone — one read-watermark per guest. Keep whichever is
  // later, so the merge never resurfaces notifications already read.
  const sourceState = await NotificationState.findOne({ guestId: sourceId }).session(session);
  if (sourceState) {
    const targetState = await NotificationState.findOne({ guestId: targetId }).session(session);

    if (!targetState) {
      await NotificationState.updateOne({ _id: sourceState._id }, set, { session });
    } else {
      if (sourceState.lastReadAt > targetState.lastReadAt) {
        await NotificationState.updateOne(
          { _id: targetState._id },
          { $set: { lastReadAt: sourceState.lastReadAt } },
          { session }
        );
      }
      await NotificationState.deleteOne({ _id: sourceState._id }, { session });
    }
  }
};

/**
 * Merges `sourceId` into `targetId` and deletes the source.
 * Returns the number of coins carried over.
 */
export const mergeGuestAccounts = async ({ sourceId, targetId }) => {
  if (String(sourceId) === String(targetId)) return { coinsMoved: 0, merged: false };

  const session = await mongoose.startSession();
  let coinsMoved = 0;

  try {
    await session.withTransaction(async () => {
      const [source, target] = await Promise.all([
        User.findById(sourceId).session(session),
        User.findById(targetId).session(session),
      ]);

      if (!source || !target) throw new ApiError(404, "Account not found");

      if (!isAbsorbableShell(source)) {
        throw new ApiError(
          409,
          "That mobile number already belongs to another account. Please contact the hotel."
        );
      }

      coinsMoved = await mergeMemberships(sourceId, targetId, session);
      await reassignOwnedRows(sourceId, targetId, session);

      // Carried over so the platform-wide "one welcome credit per person" rule
      // survives the merge and cannot be claimed twice.
      const updates = {};
      if (source.welcomeCreditClaimed) updates.welcomeCreditClaimed = true;
      if (source.name && source.name !== "Guest" && target.name === "Guest") {
        updates.name = source.name;
      }
      if (Object.keys(updates).length) {
        await User.updateOne({ _id: targetId }, { $set: updates }, { session });
      }

      // The phone must be freed before the target can claim it — the unique
      // index spans both rows until this delete lands.
      await User.deleteOne({ _id: sourceId }, { session });
    });
  } finally {
    await session.endSession();
  }

  logger.info(`[MERGE] folded ${sourceId} into ${targetId} (${coinsMoved} coins)`);
  return { coinsMoved, merged: true };
};
