import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { BILL_STATUS, TX_TYPES } from "../config/constants.js";
import {
  computeBillCoins,
  computeBillSplit,
  computeBillTotals,
  computePlatformFee,
  toRupees,
} from "../utils/coinMath.js";
import { maskEmail } from "../utils/mask.util.js";
import { searchRegex } from "../utils/regex.util.js";
import { logger } from "../utils/logger.js";
import { Bill } from "../models/bill.model.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { getSettings } from "./settings.service.js";
import { pushLedgerEvent } from "./notification.service.js";
import { emitToGuest, emitToHotel } from "../realtime/emitter.js";
import { getPaymentProvider, isDemoPayments } from "../payments/index.js";
import { canAcceptPayments } from "./onboarding.service.js";

/**
 * Staff-composed bills, and the money that settles them.
 *
 * The flow this replaces ran the other way round: the guest raised a voucher
 * code, walked it to the desk, and staff typed in a total from a separate POS.
 * Here staff compose an itemised bill and send it; the guest pays in the app.
 *
 * markBillPaid is a direct descendant of the old redeemVoucher — same
 * transaction boundary, same balance-guarded debit, same REDEEM ledger row,
 * same post-commit emits. Those pieces are load-bearing and were carried
 * across deliberately rather than rewritten.
 */

const tierCapFor = (hotel, tier) => hotel?.tierCaps?.[tier] ?? 0;

/* ----------------------------------------------------------------- search -- */

/**
 * Guests at ONE hotel, matched on name or email.
 *
 * Scoped by starting from the memberships of this hotel and joining out to
 * users, never the reverse. That ordering is the tenant boundary AND the
 * performance story: a bare regex over `users` is a collection scan across
 * every guest on the platform, and there is no index that could serve it.
 * report.service.js listMembers records the same reasoning.
 *
 * Substring rather than fuzzy: there is no text index in this deployment, and
 * true typo tolerance needs Atlas Search. Staff are reading a name off a person
 * standing in front of them, so substring is the right trade for now.
 */
export const searchGuests = async ({ hotelId, q, page = 1, limit = 10 }) => {
  const safeLimit = Math.min(25, Math.max(1, Number(limit) || 10));
  const safePage = Math.max(1, Number(page) || 1);

  const term = String(q || "").trim();
  // Enforced server-side as well as in the UI: a one-character search would
  // return most of the hotel's members and is never what staff meant.
  if (term.length < 2) return { items: [], total: 0, page: safePage, limit: safeLimit };

  const rx = searchRegex(term);
  if (!rx) return { items: [], total: 0, page: safePage, limit: safeLimit };

  const [result] = await GuestHotelMembership.aggregate([
    { $match: { hotelId: new mongoose.Types.ObjectId(String(hotelId)) } },
    {
      $lookup: {
        from: "users",
        localField: "guestId",
        foreignField: "_id",
        as: "guest",
        pipeline: [{ $project: { name: 1, email: 1, phone: 1, avatarUrl: 1 } }],
      },
    },
    { $unwind: "$guest" },
    { $match: { $or: [{ "guest.name": rx }, { "guest.email": rx }] } },
    { $sort: { lastActivityAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (safePage - 1) * safeLimit }, { $limit: safeLimit }],
        meta: [{ $count: "total" }],
      },
    },
  ]);

  return {
    // Only the MASKED address leaves the server. Staff read it aloud to confirm
    // identity; revealing the full one is a separate, deliberate request.
    items: (result?.items || []).map((m) => ({
      guestId: String(m.guest._id),
      membershipId: String(m._id),
      name: m.guest.name,
      maskedEmail: maskEmail(m.guest.email),
      hasEmail: Boolean(m.guest.email),
      avatarUrl: m.guest.avatarUrl || null,
      tier: m.tier,
      balance: m.balance,
      memberNo: m.memberNo,
      joinedAt: m.joinedAt,
    })),
    total: result?.meta?.[0]?.total || 0,
    page: safePage,
    limit: safeLimit,
  };
};

/**
 * The full email for one guest, for the confirm-identity step.
 *
 * Scoped through the membership so a staff member can only ever reveal an
 * address for a guest of their own hotel — the same boundary the search uses.
 */
export const revealGuestEmail = async ({ hotelId, guestId }) => {
  if (!mongoose.isValidObjectId(guestId)) throw new ApiError(404, "Guest not found");

  const membership = await GuestHotelMembership.findOne({ guestId, hotelId }).lean();
  if (!membership) throw new ApiError(404, "That guest is not a member at this hotel");

  const guest = await User.findById(guestId).select("email name").lean();
  if (!guest) throw new ApiError(404, "Guest not found");

  logger.info(`Email revealed for guest ${guestId} at hotel ${hotelId}`);
  return { guestId: String(guestId), name: guest.name, email: guest.email || null };
};

/* ------------------------------------------------------------------ bills -- */

/**
 * Prices a bill without persisting it — the composer's running total.
 *
 * Shares every line of arithmetic with createBill so the figure staff see and
 * the figure that gets stored cannot diverge.
 */
export const priceBill = ({ lineItems, taxPercent }) => {
  const priced = (lineItems || []).map((item) => {
    const qty = Math.max(1, Math.trunc(Number(item?.qty) || 0));
    const unitPricePaise = Math.max(0, Math.trunc(Number(item?.unitPricePaise) || 0));

    return {
      description: String(item?.description || "").trim(),
      qty,
      unitPricePaise,
      amountPaise: qty * unitPricePaise,
    };
  });

  return { lineItems: priced, ...computeBillTotals({ lineItems: priced, taxPercent }) };
};

/**
 * Composes a bill and sends it to the guest.
 *
 * One document, so no transaction is needed — unlike payment, which spans
 * three. The guest is pushed the bill and the hotel's own panel is told too,
 * so a second staff member sees it appear.
 */
export const createBill = async ({ hotelId, guestId, staffId, lineItems, taxPercent, outlet }) => {
  if (!mongoose.isValidObjectId(guestId)) throw new ApiError(404, "Guest not found");

  const settings = await getSettings();

  const [hotel, membership] = await Promise.all([
    Hotel.findById(hotelId).lean(),
    GuestHotelMembership.findOne({ guestId, hotelId }).lean(),
  ]);

  if (!hotel) throw new ApiError(404, "Hotel not found");
  // The tenant boundary at the point of creation: a guest who is not a member
  // here cannot be billed here, whatever id was posted.
  if (!membership) throw new ApiError(404, "That guest is not a member at this hotel");

  /**
   * A hotel that cannot be paid must not be able to send a bill.
   *
   * Blocked here rather than at payment because the failure would otherwise
   * land on the guest, at the desk, holding a bill nobody can settle — and
   * staff would have no idea why. In demo mode the provider reports every
   * account activated, so this never blocks a demonstration.
   */
  if (!canAcceptPayments(hotel)) {
    throw new ApiError(
      409,
      "This hotel is not set up to take payments yet. Ask your Billionax contact to finish onboarding."
    );
  }

  const priced = priceBill({ lineItems, taxPercent });

  if (!priced.lineItems.length) throw new ApiError(400, "Add at least one item to the bill");
  if (priced.totalPaise <= 0) throw new ApiError(400, "A bill must come to more than zero");

  const bill = await Bill.create({
    hotelId,
    guestId,
    membershipId: membership._id,
    staffId,
    outlet,
    lineItems: priced.lineItems,
    subtotalPaise: priced.subtotalPaise,
    taxPercent: Math.max(0, Number(taxPercent) || 0),
    taxPaise: priced.taxPaise,
    totalPaise: priced.totalPaise,
    // No coins yet: the guest chooses how many to apply when they pay.
    payablePaise: priced.totalPaise,
    // Frozen at creation so a later settings change cannot silently reprice a
    // bill the guest has already been shown.
    platformFeePercent: settings.platformFeePercent,
    tierCapPercent: tierCapFor(hotel, membership.tier),
    tierAtBill: membership.tier,
    isDemo: isDemoPayments(),
    expiresAt: new Date(Date.now() + settings.voucherTtlMinutes * 60_000),
  });

  const payload = shapeBill(bill, hotel, membership.balance);

  emitToGuest(guestId, "bill:created", { bill: payload });
  emitToHotel(hotelId, "bill:new", { bill: payload });

  logger.info(`Bill ${bill._id} created at hotel ${hotelId} for guest ${guestId}`);
  return payload;
};

/**
 * The client-facing shape of a bill. One place, so guest and staff agree.
 *
 * coinBalance rides along rather than being read from the guest's membership
 * list in the browser: the popup can appear before that list has loaded, and a
 * coin slider that silently caps at zero because a *different* request has not
 * landed yet is worse than no slider at all.
 */
export const shapeBill = (bill, hotel, coinBalance = null) => ({
  id: String(bill._id),
  hotelId: String(bill.hotelId),
  hotel: hotel ? { name: hotel.name, logoUrl: hotel.logoUrl || null } : undefined,
  guestId: String(bill.guestId),
  outlet: bill.outlet || null,
  lineItems: bill.lineItems.map((i) => ({
    description: i.description,
    qty: i.qty,
    unitPricePaise: i.unitPricePaise,
    amountPaise: i.amountPaise,
  })),
  subtotalPaise: bill.subtotalPaise,
  taxPercent: bill.taxPercent,
  taxPaise: bill.taxPaise,
  totalPaise: bill.totalPaise,
  coinsApplied: bill.coinsApplied,
  coinsDiscountPaise: bill.coinsDiscountPaise,
  payablePaise: bill.payablePaise,
  tierCapPercent: bill.tierCapPercent,
  coinBalance,
  status: bill.status,
  expiresAt: bill.expiresAt,
  paidAt: bill.paidAt || null,
  createdAt: bill.createdAt,
});

/** A guest's bills. PENDING ones are what the Pay screen and a reconnect want. */
export const listGuestBills = async ({ guestId, status, limit = 20 }) => {
  const query = { guestId };
  if (status) query.status = status;
  // A lapsed bill is not payable even before the sweep has relabelled it.
  if (status === BILL_STATUS.PENDING) query.expiresAt = { $gt: new Date() };

  const bills = await Bill.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(50, Math.max(1, Number(limit) || 20)))
    .populate("hotelId", "name logoUrl")
    .lean();

  // One query for every membership involved, rather than one per bill.
  const memberships = await GuestHotelMembership.find({
    _id: { $in: bills.map((b) => b.membershipId) },
  })
    .select("balance")
    .lean();

  const balanceBy = new Map(memberships.map((m) => [String(m._id), m.balance]));

  return {
    items: bills.map((bill) =>
      shapeBill(bill, bill.hotelId, balanceBy.get(String(bill.membershipId)) ?? null)
    ),
  };
};

/** This hotel's bills, for the staff panel. */
export const listHotelBills = async ({ hotelId, status, page = 1, limit = 20 }) => {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const query = { hotelId };
  if (status) query.status = status;

  const [bills, total] = await Promise.all([
    Bill.find(query)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate("guestId", "name")
      .lean(),
    Bill.countDocuments(query),
  ]);

  return {
    items: bills.map((bill) => ({
      ...shapeBill(bill),
      guestName: bill.guestId?.name || "Guest",
    })),
    total,
    page: safePage,
    limit: safeLimit,
  };
};

/** One bill the guest owns. The scoping is the guestId in the filter. */
export const getBillForGuest = async ({ billId, guestId }) => {
  if (!mongoose.isValidObjectId(billId)) throw new ApiError(404, "Bill not found");

  const bill = await Bill.findOne({ _id: billId, guestId })
    .populate("hotelId", "name logoUrl")
    .lean();

  if (!bill) throw new ApiError(404, "Bill not found");

  const membership = await GuestHotelMembership.findById(bill.membershipId)
    .select("balance")
    .lean();

  return shapeBill(bill, bill.hotelId, membership?.balance ?? null);
};

/**
 * Guest declines a bill. Only a PENDING one, and only their own.
 *
 * The status filter is the mutex, as everywhere else here: a bill already paid
 * or expired cannot be retroactively cancelled by a slow second tap.
 */
export const cancelBill = async ({ billId, guestId }) => {
  if (!mongoose.isValidObjectId(billId)) throw new ApiError(404, "Bill not found");

  const bill = await Bill.findOneAndUpdate(
    { _id: billId, guestId, status: BILL_STATUS.PENDING },
    { $set: { status: BILL_STATUS.CANCELLED, cancelledAt: new Date(), cancelledBy: guestId } },
    { new: true }
  );

  if (!bill) throw new ApiError(400, "This bill can no longer be cancelled");

  const payload = { billId: String(bill._id), status: bill.status };
  emitToGuest(guestId, "bill:cancelled", payload);
  emitToHotel(bill.hotelId, "bill:cancelled", { ...payload, guestId: String(guestId) });

  logger.info(`Bill ${bill._id} cancelled by guest ${guestId}`);
  return payload;
};

/**
 * Starts a payment: prices the coins the guest chose and opens a provider order.
 *
 * The coin choice is re-validated here against the balance and the tier cap
 * recorded on the bill. A client that posts a larger number gets it clamped,
 * not honoured — the slider is a convenience, never the authority.
 */
export const startBillPayment = async ({ billId, guestId, coinsRequested = 0 }) => {
  if (!mongoose.isValidObjectId(billId)) throw new ApiError(404, "Bill not found");

  const bill = await Bill.findOne({ _id: billId, guestId, status: BILL_STATUS.PENDING });
  if (!bill) throw new ApiError(404, "Bill not found");
  if (bill.expiresAt <= new Date()) throw new ApiError(400, "This bill has expired");

  const membership = await GuestHotelMembership.findById(bill.membershipId).lean();
  if (!membership) throw new ApiError(404, "Membership not found");

  const { coinsApplied, coinsDiscountPaise, payablePaise } = computeBillCoins({
    coinsRequested,
    balance: membership.balance,
    totalPaise: bill.totalPaise,
    tierCapPercent: bill.tierCapPercent,
  });

  const { platformCommissionPaise, hotelAmountPaise } = computeBillSplit({
    payablePaise,
    feePercent: bill.platformFeePercent,
  });

  // A bill fully covered by coins has nothing to charge, so there is no order
  // to open — it settles on the spot.
  if (payablePaise === 0) {
    return {
      bill: shapeBill(
        Object.assign(bill, { coinsApplied, coinsDiscountPaise, payablePaise })
      ),
      order: null,
      settlesWithoutPayment: true,
    };
  }

  const settings = await getSettings();
  const hotel = await Hotel.findById(bill.hotelId).select("razorpayLinkedAccountId").lean();

  const provider = getPaymentProvider();
  const order = await provider.createOrder({
    amountPaise: payablePaise,
    receipt: String(bill._id),
    notes: { billId: String(bill._id), hotelId: String(bill.hotelId) },
    /**
     * The hotel's 95%, split by the gateway as it settles the payment rather
     * than transferred afterwards — there is then no window where the whole
     * amount sits with the platform and a crash could strand the hotel's share.
     *
     * Held for a configurable window so a refund in the first days comes out of
     * money we still control, instead of being clawed back from the hotel.
     */
    transfer: {
      linkedAccountId: hotel?.razorpayLinkedAccountId,
      amountPaise: hotelAmountPaise,
      holdUntilUnix: Math.floor(
        (Date.now() + (settings.transferHoldHours ?? 48) * 3600_000) / 1000
      ),
    },
  });

  // Persisted before the guest is sent to checkout, so a callback can always be
  // matched back to the bill it belongs to.
  bill.coinsApplied = coinsApplied;
  bill.coinsDiscountPaise = coinsDiscountPaise;
  bill.payablePaise = payablePaise;
  bill.platformCommissionPaise = platformCommissionPaise;
  bill.hotelAmountPaise = hotelAmountPaise;
  bill.razorpayOrderId = order.providerOrderId;
  await bill.save();

  logger.info(
    `Payment started for bill ${bill._id}: ${payablePaise} paise, ${coinsApplied} coins, order ${order.providerOrderId}`
  );

  return { bill: shapeBill(bill), order, settlesWithoutPayment: false };
};

/**
 * Confirms payment and settles the bill.
 *
 * Descended from redeemVoucher, and the structure is preserved on purpose:
 *
 *  - the status flip is the mutex, so a double-submit cannot debit twice;
 *  - the balance debit is guarded by { balance: { $gte } }, which is what makes
 *    a negative balance impossible under concurrency;
 *  - the REDEEM ledger row is written in RUPEES, because that is the unit the
 *    ledger and the month-end rebate have always used;
 *  - emits happen AFTER the transaction commits, because withTransaction
 *    retries on transient errors and an emit inside the callback would fire
 *    once per attempt.
 */
export const markBillPaid = async ({ billId, guestId, providerPaymentId, signature, trusted = false }) => {
  if (!mongoose.isValidObjectId(billId)) throw new ApiError(404, "Bill not found");

  const existing = await Bill.findOne({ _id: billId, guestId }).lean();
  if (!existing) throw new ApiError(404, "Bill not found");

  // Already settled — return the same answer rather than erroring, so a retried
  // callback is harmless.
  if (existing.status === BILL_STATUS.PAID) {
    return { billId: String(existing._id), status: existing.status, alreadyPaid: true };
  }

  // Two cases skip signature checking. A bill covered entirely by coins never
  // opened an order, so there is nothing signed to check. And a webhook has
  // already proved its own HMAC over the raw body, which is a stronger
  // guarantee than the browser-supplied signature this would verify.
  if (existing.payablePaise > 0 && !trusted) {
    const provider = getPaymentProvider();
    const verified = await provider.verifyPayment({
      providerOrderId: existing.razorpayOrderId,
      providerPaymentId,
      signature,
    });

    if (!verified.ok) {
      // The bill stays PENDING so the guest can simply try again.
      logger.warn(`Payment verification failed for bill ${billId}`);
      throw new ApiError(400, "That payment could not be verified. Please try again.");
    }
  }

  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      // Claim the bill first. The status flip is what makes settlement
      // single-shot under a double tap or a retried webhook.
      const bill = await Bill.findOneAndUpdate(
        { _id: billId, guestId, status: BILL_STATUS.PENDING },
        {
          $set: {
            status: BILL_STATUS.PAID,
            paidAt: new Date(),
            razorpayPaymentId: providerPaymentId || null,
          },
        },
        { new: true, session }
      );

      if (!bill) throw new ApiError(400, "This bill is no longer awaiting payment");

      let transaction = null;
      let balanceAfter = null;

      if (bill.coinsApplied > 0) {
        const debited = await GuestHotelMembership.findOneAndUpdate(
          { _id: bill.membershipId, balance: { $gte: bill.coinsApplied } },
          {
            $inc: { balance: -bill.coinsApplied, lifetimeRedeemed: bill.coinsApplied },
            $set: { lastActivityAt: new Date() },
          },
          { new: true, session }
        );

        if (!debited) throw new ApiError(409, "Your balance changed, please try again");

        balanceAfter = debited.balance;

        /**
         * THE UNIT BOUNDARY. Bill money is paise; this ledger is rupees, and
         * rebate.service.js aggregates these rows as rupees. Writing a paise
         * figure here would inflate every month-end settlement 100x, silently.
         */
        const billAmountRupees = toRupees(bill.totalPaise);
        const cashPayableRupees = toRupees(bill.payablePaise);

        [transaction] = await CoinTransaction.create(
          [
            {
              type: TX_TYPES.REDEEM,
              guestId: bill.guestId,
              hotelId: bill.hotelId,
              membershipId: bill.membershipId,
              coins: -bill.coinsApplied,
              balanceAfter: debited.balance,
              billAmount: billAmountRupees,
              cashPayable: cashPayableRupees,
              outlet: bill.outlet,
              platformFee: computePlatformFee({
                cashPayable: cashPayableRupees,
                feePercent: bill.platformFeePercent,
              }),
              performedBy: bill.staffId,
              idempotencyKey: `bill:${bill._id}`,
              // Carried from the bill so revenue reports can exclude demo rows
              // without joining back to it.
              isDemo: bill.isDemo,
            },
          ],
          { session }
        );

        await Bill.updateOne(
          { _id: bill._id },
          { $set: { transactionId: transaction._id } },
          { session }
        );

        // The counter the month-end rebate is built on.
        await Hotel.updateOne(
          { _id: bill.hotelId },
          { $inc: { totalCoinsRedeemed: bill.coinsApplied } },
          { session }
        );
      }

      result = {
        billId: String(bill._id),
        hotelId: bill.hotelId,
        guestId: bill.guestId,
        status: bill.status,
        coinsApplied: bill.coinsApplied,
        payablePaise: bill.payablePaise,
        balanceAfter,
        transactionDoc: transaction,
      };
    });
  } finally {
    await session.endSession();
  }

  // Emitted only after the commit: withTransaction retries, and an emit inside
  // the callback would fire once per attempt.
  if (result) {
    if (result.transactionDoc) {
      await pushLedgerEvent({ guestId: result.guestId, transaction: result.transactionDoc });
      emitToGuest(result.guestId, "balance:changed", {
        hotelId: String(result.hotelId),
        balance: result.balanceAfter,
        delta: -result.coinsApplied,
      });
    }

    const payload = {
      billId: result.billId,
      status: result.status,
      coinsApplied: result.coinsApplied,
      payablePaise: result.payablePaise,
    };

    emitToGuest(result.guestId, "bill:paid", payload);
    emitToHotel(result.hotelId, "bill:paid", { ...payload, guestId: String(result.guestId) });
    emitToHotel(result.hotelId, "hotel:transaction", {
      type: TX_TYPES.REDEEM,
      coins: -result.coinsApplied,
      createdAt: new Date(),
    });

    logger.info(
      `Bill ${result.billId} PAID: ${result.payablePaise} paise, ${result.coinsApplied} coins`
    );
  }

  return result;
};

/**
 * Relabels lapsed bills so the panel stops offering them.
 *
 * Never deletes: a bill is the audit trail behind a REDEEM ledger row. This is
 * the same reason voucher.model.js refuses a TTL index.
 */
export const expireStaleBills = async () => {
  const stale = await Bill.find({
    status: BILL_STATUS.PENDING,
    expiresAt: { $lte: new Date() },
  })
    .select("_id guestId hotelId")
    .lean();

  if (!stale.length) return { expired: 0 };

  await Bill.updateMany(
    { _id: { $in: stale.map((b) => b._id) } },
    { $set: { status: BILL_STATUS.EXPIRED } }
  );

  for (const bill of stale) {
    const payload = { billId: String(bill._id), status: BILL_STATUS.EXPIRED };
    emitToGuest(bill.guestId, "bill:expired", payload);
    emitToHotel(bill.hotelId, "bill:expired", { ...payload, guestId: String(bill.guestId) });
  }

  logger.info(`Expired ${stale.length} stale bill(s)`);
  return { expired: stale.length };
};
