import { ApiError } from "../utils/ApiError.js";
import { ROLES, TX_TYPES, PURCHASE_STATUS } from "../config/constants.js";
import { computeEarnedCoins, computeStayCoins } from "../utils/coinMath.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { CoinPurchase } from "../models/coinPurchase.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { getSettings } from "./settings.service.js";
import { joinHotel, refreshTier } from "./membership.service.js";
import { normalizePhone } from "./otp.service.js";
import { pushLedgerEvent } from "./notification.service.js";
import { issueInvoiceForPurchase } from "./invoice.service.js";
import { emitToGuest, emitToHotel } from "../realtime/emitter.js";
import { logger } from "../utils/logger.js";

/**
 * Idempotency for the credit paths.
 *
 * CoinTransaction has always carried a unique partial index on idempotencyKey,
 * but only voucher redemption set it — so a double-clicked "Add coins" credited
 * the guest twice from real inventory, permanently. These two helpers let the
 * credit paths replay safely instead.
 */
const findByIdempotencyKey = async (idempotencyKey) => {
  if (!idempotencyKey) return null;
  return CoinTransaction.findOne({ idempotencyKey });
};

/** Rebuilds a credit's response from the ledger row the first attempt wrote. */
const replayResult = async (transaction) => {
  const [membership, hotel, guest] = await Promise.all([
    GuestHotelMembership.findById(transaction.membershipId),
    Hotel.findById(transaction.hotelId),
    User.findById(transaction.guestId),
  ]);

  return {
    guest: guest ? guest.toSafeObject() : null,
    coinsAllocated: transaction.coins,
    coinsCredited: transaction.coins,
    balance: membership?.balance ?? transaction.balanceAfter,
    hotelInventory: hotel?.coinInventory ?? 0,
    transactionId: transaction._id,
    replayed: true,
  };
};

/**
 * Coin packs a hotel can buy from the panel. Larger packs carry a discount, so
 * the price is not simply coins x coinValue.
 */
export const COIN_PACKS = [
  { id: "starter", coins: 50_000, price: 50_000, label: "Starter" },
  { id: "growth", coins: 100_000, price: 95_000, label: "Growth", saving: "5% off" },
  { id: "scale", coins: 250_000, price: 225_000, label: "Scale", saving: "10% off" },
  { id: "enterprise", coins: 500_000, price: 425_000, label: "Enterprise", saving: "15% off" },
];

/**
 * A hotel buying coins for itself from the panel.
 *
 * The payment is simulated for now — `paymentMethod` and the generated
 * reference are recorded so the ledger shape is already correct when a real
 * gateway is wired in. Swapping this for Razorpay/Stripe means verifying the
 * gateway signature here before calling recordPurchase; nothing downstream
 * changes.
 */
export const purchaseCoinPack = async ({ hotelId, packId, coins, price, paymentMethod, purchasedBy }) => {
  const pack = COIN_PACKS.find((p) => p.id === packId);

  // Custom amounts are allowed; packs are validated against the server-side
  // price so a tampered client cannot buy 500k coins for ₹1.
  const finalCoins = pack ? pack.coins : Number(coins);
  const finalPrice = pack ? pack.price : Number(price);

  if (!(finalCoins > 0)) throw new ApiError(400, "Choose how many coins to buy");
  if (!(finalPrice >= 0)) throw new ApiError(400, "Invalid amount");

  if (!pack) {
    // Custom purchase: price must match the platform's coin value.
    const settings = await getSettings();
    const expected = Math.round((finalCoins * settings.coinValuePaise) / 100);
    if (finalPrice !== expected) {
      throw new ApiError(400, `Amount for ${finalCoins} coins should be ${expected}`);
    }
  }

  const reference = `SIM-${Date.now().toString(36).toUpperCase()}`;

  return recordPurchase({
    hotelId,
    coins: finalCoins,
    amountPaid: finalPrice,
    paymentRef: reference,
    note: `Self-service purchase${pack ? ` (${pack.label} pack)` : ""} via ${paymentMethod || "card"} — simulated payment`,
    recordedBy: purchasedBy,
  });
};

/** Platform sells coin inventory to a hotel. Credits the hotel's balance. */
export const recordPurchase = async ({ hotelId, coins, amountPaid, paymentRef, note, recordedBy }) => {
  const settings = await getSettings();

  const hotel = await Hotel.findByIdAndUpdate(
    hotelId,
    { $inc: { coinInventory: coins, totalCoinsPurchased: coins } },
    { new: true }
  );
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const purchase = await CoinPurchase.create({
    hotelId,
    coins,
    amountPaid,
    unitPricePaise: settings.coinValuePaise,
    paymentRef,
    note,
    recordedBy,
    status: PURCHASE_STATUS.COMPLETED,
  });

  emitToHotel(hotelId, "hotel:inventory", { coinInventory: hotel.coinInventory });

  // Caught and logged for the same reason the bill path catches: the inventory
  // has already moved and the purchase row is already written, so a failure to
  // produce the paperwork must not undo a completed sale.
  try {
    await issueInvoiceForPurchase(purchase._id);
  } catch (err) {
    logger.error(`Invoice issue failed for purchase ${purchase._id}: ${err.message}`);
  }

  return { purchase, coinInventory: hotel.coinInventory };
};

/**
 * Allocates coins to a guest for a stay: Room x Nights x Rate%.
 *
 * The hotel's inventory decrement uses the balance check AS the query filter,
 * so two concurrent allocations can never both pass a stale read. Never
 * findById -> check -> save().
 */
export const allocateCoins = async ({
  hotelId,
  phone: rawPhone,
  name,
  roomAmount,
  nights,
  ratePercent,
  performedBy,
  idempotencyKey,
}) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");
  if (!hotel.isActive) throw new ApiError(403, "This hotel is not active");

  // Checked before any inventory moves: a double-submitted allocation must not
  // debit the hotel and then fail on the unique index. The index remains the
  // real guarantee against a race — this is the fast, non-destructive path.
  const replay = await findByIdempotencyKey(idempotencyKey);
  if (replay) return replayResult(replay);

  const rate = ratePercent ?? hotel.earnRatePercent;
  const coins = computeEarnedCoins({ roomAmount, nights, ratePercent: rate });

  if (coins <= 0) throw new ApiError(400, "This stay does not earn any coins");

  const phone = normalizePhone(rawPhone);

  // Guests are created on allocation if they have not scanned yet.
  let guest = await User.findOne({ phone, role: ROLES.GUEST });
  if (!guest) {
    guest = await User.create({ role: ROLES.GUEST, name: name?.trim() || "Guest", phone });
  }

  // Reserve this allocation's coins BEFORE joining. joinHotel may grant a
  // welcome credit from the same inventory, and the stay allocation the staff
  // member explicitly asked for must take precedence over an automatic bonus.
  //
  // The guard: the balance check IS the query filter, so two concurrent
  // allocations can never both pass on a stale read.
  const funded = await Hotel.findOneAndUpdate(
    { _id: hotelId, coinInventory: { $gte: coins } },
    { $inc: { coinInventory: -coins, totalCoinsAllocated: coins } },
    { new: true }
  );

  if (!funded) {
    throw new ApiError(
      409,
      "Hotel has insufficient coin inventory. Purchase more coins before allocating."
    );
  }

  let membership;
  try {
    ({ membership } = await joinHotel({ guestId: guest._id, hotel }));
  } catch (error) {
    // Release the reservation so a failed join cannot strand inventory.
    await Hotel.updateOne(
      { _id: hotelId },
      { $inc: { coinInventory: coins, totalCoinsAllocated: -coins } }
    );
    throw error;
  }

  const updated = await GuestHotelMembership.findOneAndUpdate(
    { _id: membership._id },
    { $inc: { balance: coins, lifetimeEarned: coins }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );

  let transaction;
  try {
    transaction = await CoinTransaction.create({
      type: TX_TYPES.EARN,
      guestId: guest._id,
      hotelId,
      membershipId: membership._id,
      coins,
      balanceAfter: updated.balance,
      roomAmount,
      nights,
      ratePercent: rate,
      performedBy,
      idempotencyKey,
      note: "Stay allocation",
    });
  } catch (error) {
    // A concurrent duplicate won the unique index. Undo this attempt's balance
    // and inventory moves, then return the winner's result — the guest must
    // end up credited exactly once.
    if (error?.code === 11000) {
      await GuestHotelMembership.updateOne(
        { _id: membership._id },
        { $inc: { balance: -coins, lifetimeEarned: -coins } }
      );
      await Hotel.updateOne(
        { _id: hotelId },
        { $inc: { coinInventory: coins, totalCoinsAllocated: -coins } }
      );
      const winner = await findByIdempotencyKey(idempotencyKey);
      if (winner) return replayResult(winner);
    }
    throw error;
  }

  await refreshTier(membership._id);

  // Emitted here, at the very end — NOT near the try/catch above. That block
  // refunds the hotel's inventory if joinHotel throws, so anything emitted
  // earlier could describe coins that were then rolled back.
  await pushLedgerEvent({ guestId: guest._id, transaction, hotel });
  emitToGuest(guest._id, "balance:changed", {
    hotelId,
    balance: updated.balance,
    delta: coins,
  });
  emitToHotel(hotelId, "hotel:transaction", {
    type: TX_TYPES.EARN,
    coins,
    guestName: guest.name,
    createdAt: transaction.createdAt,
  });
  emitToHotel(hotelId, "hotel:inventory", { coinInventory: funded.coinInventory });

  return {
    guest: guest.toSafeObject(),
    coinsAllocated: coins,
    balance: updated.balance,
    hotelInventory: funded.coinInventory,
    transactionId: transaction._id,
  };
};

/** Manual correction by the main admin. Can be positive or negative. */
export const adjustCoins = async ({ hotelId, guestId, coins, note, performedBy }) => {
  const membership = await GuestHotelMembership.findOne({ guestId, hotelId });
  if (!membership) throw new ApiError(404, "Membership not found");

  if (coins < 0) {
    const debited = await GuestHotelMembership.findOneAndUpdate(
      { _id: membership._id, balance: { $gte: Math.abs(coins) } },
      { $inc: { balance: coins }, $set: { lastActivityAt: new Date() } },
      { new: true }
    );
    if (!debited) throw new ApiError(409, "Guest does not have enough coins for this adjustment");

    await CoinTransaction.create({
      type: TX_TYPES.ADJUSTMENT,
      guestId,
      hotelId,
      membershipId: membership._id,
      coins,
      balanceAfter: debited.balance,
      performedBy,
      note: note || "Manual adjustment",
    });
    return { balance: debited.balance };
  }

  const credited = await GuestHotelMembership.findOneAndUpdate(
    { _id: membership._id },
    { $inc: { balance: coins, lifetimeEarned: coins }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );

  await CoinTransaction.create({
    type: TX_TYPES.ADJUSTMENT,
    guestId,
    hotelId,
    membershipId: membership._id,
    coins,
    balanceAfter: credited.balance,
    performedBy,
    note: note || "Manual adjustment",
  });

  await refreshTier(membership._id);
  return { balance: credited.balance };
};

/**
 * Credits coins straight to an existing member, without a stay calculation.
 * Used by the coin button on the hotel's Members table.
 *
 * Draws from the hotel's inventory with the same conditional-filter guard as
 * allocateCoins, so it can never overdraw.
 */
export const creditMember = async ({
  hotelId,
  membershipId,
  coins,
  note,
  performedBy,
  idempotencyKey,
}) => {
  if (!(coins > 0)) throw new ApiError(400, "Enter how many coins to add");

  const membership = await GuestHotelMembership.findOne({ _id: membershipId, hotelId });
  if (!membership) throw new ApiError(404, "Member not found at this hotel");

  // Before any inventory moves — see allocateCoins.
  const replay = await findByIdempotencyKey(idempotencyKey);
  if (replay) return replayResult(replay);

  const funded = await Hotel.findOneAndUpdate(
    { _id: hotelId, coinInventory: { $gte: coins } },
    { $inc: { coinInventory: -coins, totalCoinsAllocated: coins } },
    { new: true }
  );

  if (!funded) {
    throw new ApiError(
      409,
      "Hotel has insufficient coin inventory. Purchase more coins before crediting."
    );
  }

  const updated = await GuestHotelMembership.findOneAndUpdate(
    { _id: membership._id },
    { $inc: { balance: coins, lifetimeEarned: coins }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );

  let transaction;
  try {
    transaction = await CoinTransaction.create({
      type: TX_TYPES.ADJUSTMENT,
      guestId: membership.guestId,
      hotelId,
      membershipId: membership._id,
      coins,
      balanceAfter: updated.balance,
      performedBy,
      idempotencyKey,
      note: note || "Coins added by hotel",
    });
  } catch (error) {
    // Concurrent duplicate — unwind this attempt and return the winner's.
    if (error?.code === 11000) {
      await GuestHotelMembership.updateOne(
        { _id: membership._id },
        { $inc: { balance: -coins, lifetimeEarned: -coins } }
      );
      await Hotel.updateOne(
        { _id: hotelId },
        { $inc: { coinInventory: coins, totalCoinsAllocated: -coins } }
      );
      const winner = await findByIdempotencyKey(idempotencyKey);
      if (winner) return replayResult(winner);
    }
    throw error;
  }

  await refreshTier(membership._id);

  // This is the "someone sent me coins" alert.
  await pushLedgerEvent({ guestId: membership.guestId, transaction, hotel: funded });
  emitToGuest(membership.guestId, "balance:changed", {
    hotelId,
    balance: updated.balance,
    delta: coins,
  });
  emitToHotel(hotelId, "hotel:transaction", {
    type: TX_TYPES.ADJUSTMENT,
    coins,
    createdAt: transaction.createdAt,
  });
  emitToHotel(hotelId, "hotel:inventory", { coinInventory: funded.coinInventory });

  return {
    coinsCredited: coins,
    balance: updated.balance,
    hotelInventory: funded.coinInventory,
  };
};

/**
 * Records a stay for an existing member: nights + total amount.
 *
 * Two things happen, in this order and deliberately so:
 *   1. Coins are credited at the rate for the tier the guest ALREADY holds.
 *   2. The nights are added, which may promote them for their next stay.
 *
 * Crediting first is what the desk can explain: "this stay earned your Silver
 * rate; you're Gold from the next one." Computing the rate after the promotion
 * would retroactively reprice a stay the guest booked as a Silver member.
 *
 * Inventory is drawn with the same conditional-filter guard as allocateCoins,
 * so it can never overdraw.
 */
export const recordStay = async ({
  hotelId,
  membershipId,
  nights,
  amount,
  note,
  performedBy,
  idempotencyKey,
}) => {
  if (!(nights > 0)) throw new ApiError(400, "Enter how many nights the guest stayed");
  if (!(amount > 0)) throw new ApiError(400, "Enter the total amount for the stay");

  const membership = await GuestHotelMembership.findOne({ _id: membershipId, hotelId });
  if (!membership) throw new ApiError(404, "Member not found at this hotel");

  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");
  if (!hotel.isActive) throw new ApiError(403, "This hotel is not active");

  // Before any inventory moves — see allocateCoins.
  const replay = await findByIdempotencyKey(idempotencyKey);
  if (replay) return replayResult(replay);

  // The tier held BEFORE this stay's nights land. See the note above.
  const tierAtEarn = membership.tier;
  const ratePercent = hotel.tierEarnRates?.[tierAtEarn] ?? hotel.earnRatePercent;
  const coins = computeStayCoins({ amount, tier: tierAtEarn, tierEarnRates: hotel.tierEarnRates });

  let funded = hotel;

  // A 0% tier rate is legitimate configuration, so only touch inventory when
  // there are actually coins to move.
  if (coins > 0) {
    funded = await Hotel.findOneAndUpdate(
      { _id: hotelId, coinInventory: { $gte: coins } },
      { $inc: { coinInventory: -coins, totalCoinsAllocated: coins } },
      { new: true }
    );

    if (!funded) {
      throw new ApiError(
        409,
        "Hotel has insufficient coin inventory. Purchase more coins before recording this stay."
      );
    }
  }

  // Nights and coins move together: the stay is one fact, so a guest can never
  // end up credited without the nights that justified the credit.
  const updated = await GuestHotelMembership.findOneAndUpdate(
    { _id: membership._id },
    {
      $inc: {
        balance: coins,
        lifetimeEarned: coins,
        lifetimeNights: nights,
        lifetimeSpend: amount,
      },
      $set: { lastActivityAt: new Date() },
    },
    { new: true }
  );

  let transaction;
  try {
    transaction = await CoinTransaction.create({
      type: TX_TYPES.STAY,
      guestId: membership.guestId,
      hotelId,
      membershipId: membership._id,
      coins,
      balanceAfter: updated.balance,
      roomAmount: amount,
      nights,
      ratePercent,
      tierAtEarn,
      performedBy,
      idempotencyKey,
      note: note || `Stay recorded — ${nights} night${nights === 1 ? "" : "s"}`,
    });
  } catch (error) {
    // Concurrent duplicate won the unique index. Unwind everything this attempt
    // moved — nights included — and return the winner's result.
    if (error?.code === 11000) {
      await GuestHotelMembership.updateOne(
        { _id: membership._id },
        {
          $inc: {
            balance: -coins,
            lifetimeEarned: -coins,
            lifetimeNights: -nights,
            lifetimeSpend: -amount,
          },
        }
      );
      if (coins > 0) {
        await Hotel.updateOne(
          { _id: hotelId },
          { $inc: { coinInventory: coins, totalCoinsAllocated: -coins } }
        );
      }
      const winner = await findByIdempotencyKey(idempotencyKey);
      if (winner) return replayResult(winner);
    }
    throw error;
  }

  // Now the nights are banked, this may promote them.
  const refreshed = await refreshTier(membership._id);

  await pushLedgerEvent({ guestId: membership.guestId, transaction, hotel: funded });

  if (coins > 0) {
    emitToGuest(membership.guestId, "balance:changed", {
      hotelId,
      balance: updated.balance,
      delta: coins,
    });
  }
  emitToHotel(hotelId, "hotel:transaction", {
    type: TX_TYPES.STAY,
    coins,
    nights,
    createdAt: transaction.createdAt,
  });
  emitToHotel(hotelId, "hotel:inventory", { coinInventory: funded.coinInventory });

  return {
    coinsCredited: coins,
    ratePercent,
    tierAtEarn,
    tier: refreshed?.tier ?? updated.tier,
    tierChanged: (refreshed?.tier ?? updated.tier) !== tierAtEarn,
    nights,
    amount,
    lifetimeNights: updated.lifetimeNights,
    balance: updated.balance,
    hotelInventory: funded.coinInventory,
  };
};

/** Returns { purchases, total, page, limit } — bespoke key kept deliberately. */
export const listPurchases = async ({ hotelId, status, from, to, page = 1, limit = 25 }) => {
  const filter = { hotelId };
  if (status) filter.status = status;

  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const skip = (page - 1) * limit;

  const [purchases, total] = await Promise.all([
    CoinPurchase.find(filter)
      .populate("recordedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CoinPurchase.countDocuments(filter),
  ]);

  return { purchases, total, page, limit };
};
