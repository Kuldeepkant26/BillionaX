import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { BILL_STATUS, TX_TYPES } from "../config/constants.js";
import {
  computeBillCoins,
  computeBillSplit,
  computeBillTotals,
  computeCoinAllowance,
  computePlatformFee,
  toRupees,
} from "../utils/coinMath.js";
import { maskEmail } from "../utils/mask.util.js";
import { searchRegex } from "../utils/regex.util.js";
import { endOfDay } from "../utils/date.util.js";
import { logger } from "../utils/logger.js";
import { Bill } from "../models/bill.model.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { getSettings } from "./settings.service.js";
import { resolveServiceCaps } from "./hotelService.service.js";
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

/**
 * The one service a bill was for, or undefined when it was for several.
 *
 * Staff used to label the whole bill with an outlet on top of tagging each
 * line; that second, coarser answer was the same fact said twice and could
 * disagree with the lines. The ledger still wants a name where one is
 * unambiguous — it is what the guest's notification reads — so it is derived
 * here instead of asked for.
 *
 * Deliberately NOT the largest line's service: putting "Spa" on a bill that was
 * mostly spa but partly dinner would be a claim the receipt does not support.
 * Unanimous or nothing.
 */
const outletFromLines = (lineItems = []) => {
  const named = lineItems.map((l) => l?.service).filter(Boolean);
  if (!named.length || named.length !== lineItems.length) return undefined;
  return named.every((s) => s === named[0]) ? named[0] : undefined;
};

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

  // The composer needs the guest's tier cap to preview the allowance on an
  // UNTAGGED line. Without it staff would see a different number from the one
  // the server resolves, which is worse than showing none at all.
  const hotel = await Hotel.findById(hotelId).select("tierCaps").lean();

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
      // The fallback rate for a line with no service on it — same resolution
      // createBill uses, so the composer's preview cannot disagree with it.
      tierCapPercent: tierCapFor(hotel, m.tier),
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
export const priceBill = ({
  lineItems,
  taxPercent,
  serviceCaps = null,
  tierCapPercent = 0,
  tier = null,
}) => {
  const priced = (lineItems || []).map((item) => {
    const qty = Math.max(1, Math.trunc(Number(item?.qty) || 0));
    const unitPricePaise = Math.max(0, Math.trunc(Number(item?.unitPricePaise) || 0));

    return {
      description: String(item?.description || "").trim(),
      // This mapper drops every key it does not name, so a line's service has
      // to be listed here or it never reaches the document.
      service: item?.service ? String(item.service).trim() : undefined,
      qty,
      unitPricePaise,
      amountPaise: qty * unitPricePaise,
    };
  });

  const totals = computeBillTotals({ lineItems: priced, taxPercent });

  // No caps map means the caller wants totals only — the /price preview, which
  // predates services. The allowance is then the tier cap on every line, which
  // is exactly the pre-services answer.
  const allowance = computeCoinAllowance({
    lineItems: priced,
    taxPercent,
    totalPaise: totals.totalPaise,
    tierCapPercent,
    // The guest's own tier rate at that service. `?? null` at each step, never
    // `||`: a service set to 0 for this tier means coins are refused there, and
    // a falsy test would fall back to the tier cap instead.
    capPercentFor: (line) => {
      if (!serviceCaps || !line.service || !tier) return null;
      const caps = serviceCaps.get(line.service.toLowerCase());
      return caps?.[tier] ?? null;
    },
  });

  return {
    lineItems: priced.map((line, i) => ({
      ...line,
      coinAllowancePaise: allowance.perLineAllowancePaise[i],
    })),
    ...totals,
    coinAllowancePaise: allowance.allowancePaise,
  };
};

/**
 * Composes a bill and sends it to the guest.
 *
 * One document, so no transaction is needed — unlike payment, which spans
 * three. The guest is pushed the bill and the hotel's own panel is told too,
 * so a second staff member sees it appear.
 */
export const createBill = async ({ hotelId, guestId, staffId, lineItems, taxPercent }) => {
  if (!mongoose.isValidObjectId(guestId)) throw new ApiError(404, "Guest not found");

  const settings = await getSettings();

  const [hotel, membership, serviceCaps] = await Promise.all([
    Hotel.findById(hotelId).lean(),
    GuestHotelMembership.findOne({ guestId, hotelId }).lean(),
    // Joins the existing reads rather than adding a round trip. An empty Map is
    // a valid answer: a hotel with no services has every line fall back to the
    // tier cap, which is the pre-services behaviour.
    resolveServiceCaps(hotelId),
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

  const tierCapPercent = tierCapFor(hotel, membership.tier);
  const priced = priceBill({
    lineItems,
    taxPercent,
    serviceCaps,
    tierCapPercent,
    // The tier decides WHICH of a service's three rates applies. Taken from the
    // membership at creation, so it is frozen with everything else.
    tier: membership.tier,
  });

  if (!priced.lineItems.length) throw new ApiError(400, "Add at least one item to the bill");
  if (priced.totalPaise <= 0) throw new ApiError(400, "A bill must come to more than zero");

  const bill = await Bill.create({
    hotelId,
    guestId,
    membershipId: membership._id,
    staffId,
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
    // Still written, still the fallback: it is what an untagged line prices at,
    // and what the panel shows as the guest's tier allowance.
    tierCapPercent,
    // The authoritative ceiling. Frozen here and read back at payment, so a
    // hotel changing a service's cap mid-checkout cannot reprice this bill.
    coinAllowancePaise: priced.coinAllowancePaise,
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
  // Mapped field by field, so anything new has to be named here or it never
  // reaches the browser — and the guest's slider would silently fall back to
  // the tier cap with no error anywhere.
  lineItems: bill.lineItems.map((i) => ({
    description: i.description,
    service: i.service || null,
    qty: i.qty,
    unitPricePaise: i.unitPricePaise,
    amountPaise: i.amountPaise,
    coinAllowancePaise: i.coinAllowancePaise ?? 0,
  })),
  subtotalPaise: bill.subtotalPaise,
  taxPercent: bill.taxPercent,
  taxPaise: bill.taxPaise,
  totalPaise: bill.totalPaise,
  coinsApplied: bill.coinsApplied,
  coinsDiscountPaise: bill.coinsDiscountPaise,
  payablePaise: bill.payablePaise,
  tierCapPercent: bill.tierCapPercent,
  // `?? null`, never `|| null`: 0 means "no coins on this bill" and must reach
  // the client as 0, not as "fall back to the tier cap".
  coinAllowancePaise: bill.coinAllowancePaise ?? null,
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

/**
 * This hotel's bills, for the staff panel — the live list and the history view.
 *
 * One function rather than two because they differ only in the filter: the
 * pending list is `status=PENDING`, the history view is everything else with a
 * date range and a search box on top. Splitting them would duplicate the
 * shaping, the pagination and the tenant scoping for no gain.
 *
 * `q` matches the GUEST's name or email, which needs a join. It is done with
 * an aggregation that starts from this hotel's bills and looks users up from
 * there — never the reverse. That ordering is the tenant boundary and the
 * performance story both, the same reasoning searchGuests records: a regex
 * over `users` first would scan every guest on the platform.
 *
 * `status` accepts an array, so the history view can ask for the three
 * terminal states in one query instead of three round trips.
 */
export const listHotelBills = async ({
  hotelId,
  status,
  q,
  outlet,
  from,
  to,
  page = 1,
  limit = 20,
}) => {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);

  const match = { hotelId: new mongoose.Types.ObjectId(String(hotelId)) };
  if (status) match.status = Array.isArray(status) ? { $in: status } : status;
  if (outlet) match.outlet = outlet;

  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    // The end of the chosen day, not its midnight: a staff member picking
    // today as the "to" date means "up to now", and an exclusive midnight
    // would silently drop everything they did today.
    if (to) match.createdAt.$lte = endOfDay(to);
  }

  const rx = q ? searchRegex(q) : null;

  const [result] = await Bill.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "users",
        localField: "guestId",
        foreignField: "_id",
        as: "guest",
        pipeline: [{ $project: { name: 1, email: 1 } }],
      },
    },
    // preserveNull so a bill whose guest was deleted still appears — it is
    // financial history, and dropping it would silently change the totals.
    { $unwind: { path: "$guest", preserveNullAndEmptyArrays: true } },
    ...(rx ? [{ $match: { $or: [{ "guest.name": rx }, { "guest.email": rx }] } }] : []),
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        items: [{ $skip: (safePage - 1) * safeLimit }, { $limit: safeLimit }],
        meta: [{ $count: "total" }],
      },
    },
  ]);

  return {
    items: (result?.items || []).map((bill) => ({
      ...shapeBill(bill),
      guestName: bill.guest?.name || "Guest",
      // MASKED, like every other list that shows an address: staff use it to
      // tell two guests of the same name apart, not to read it out.
      guestMaskedEmail: maskEmail(bill.guest?.email),
      staffName: null,
    })),
    total: result?.meta?.[0]?.total || 0,
    page: safePage,
    limit: safeLimit,
  };
};

/**
 * One bill in full, for the panel's detail view.
 *
 * hotelId in the filter is the tenant boundary — a bill at another hotel is
 * not found rather than forbidden, so the response cannot confirm it exists.
 *
 * Returns more than the list does: who sent it, who cancelled it, the coin
 * split, and the provider reference. Staff open this to answer "what actually
 * happened to this charge?", and every one of those is part of the answer.
 */
export const getBillForHotel = async ({ billId, hotelId }) => {
  if (!mongoose.isValidObjectId(billId)) throw new ApiError(404, "Bill not found");

  const bill = await Bill.findOne({ _id: billId, hotelId })
    .populate("guestId", "name email phone avatarUrl")
    .populate("staffId", "name role")
    .populate("cancelledBy", "name role")
    .lean();

  if (!bill) throw new ApiError(404, "Bill not found");

  const membership = await GuestHotelMembership.findById(bill.membershipId)
    .select("balance tier memberNo")
    .lean();

  return {
    ...shapeBill(bill),

    guest: {
      name: bill.guestId?.name || "Guest",
      // Masked here too. The detail view is opened at a desk with people
      // behind it, and there is already a deliberate reveal action elsewhere
      // for when staff genuinely need the address.
      maskedEmail: maskEmail(bill.guestId?.email),
      avatarUrl: bill.guestId?.avatarUrl || null,
      tier: bill.tierAtBill || membership?.tier || null,
      memberNo: membership?.memberNo || null,
      balance: membership?.balance ?? null,
    },

    // A bill is somebody's action; a disputed charge needs a name on it.
    staffName: bill.staffId?.name || null,
    cancelledByName: bill.cancelledBy?.name || null,
    cancelledByRole: bill.cancelledBy?.role || null,
    cancelledAt: bill.cancelledAt || null,

    /**
     * The commercial split, shown only once the bill is PAID. On a pending
     * bill these are still zero — the guest has not chosen their coins yet —
     * and displaying zeros would read as "this hotel earns nothing".
     */
    platformCommissionPaise: bill.platformCommissionPaise,
    hotelAmountPaise: bill.hotelAmountPaise,
    platformFeePercent: bill.platformFeePercent,

    // For reconciling against the gateway when a guest disputes a charge.
    paymentRef: bill.razorpayPaymentId || null,
    orderRef: bill.razorpayOrderId || null,
    isDemo: bill.isDemo,
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
 * Hotel staff void a bill they sent. Only a PENDING one, and only their own
 * hotel's.
 *
 * Same mutex as the guest's cancelBill — the status filter in the update is
 * what makes this single-shot, so a bill the guest paid a moment ago cannot be
 * voided out from under a completed payment.
 *
 * WHO MAY CANCEL: a HOTEL_ADMIN may void any pending bill at their hotel; a
 * HOTEL_STAFF may void only one they raised themselves. A mistyped bill is
 * usually caught by the person who typed it, with the guest still standing
 * there, and making them find a manager for every typo would push staff back
 * to telling the guest to "just ignore it" — which leaves the bill pending and
 * the desk out of step with the app.
 */
export const cancelBillByStaff = async ({ billId, hotelId, staffId, isAdmin }) => {
  if (!mongoose.isValidObjectId(billId)) throw new ApiError(404, "Bill not found");

  // hotelId in the filter is the tenant boundary: a bill at another hotel is
  // not "forbidden", it is simply not found by this query.
  const existing = await Bill.findOne({ _id: billId, hotelId }).lean();
  if (!existing) throw new ApiError(404, "Bill not found");

  if (!isAdmin && String(existing.staffId) !== String(staffId)) {
    throw new ApiError(403, "You can only cancel a bill you sent yourself");
  }

  const bill = await Bill.findOneAndUpdate(
    { _id: billId, hotelId, status: BILL_STATUS.PENDING },
    { $set: { status: BILL_STATUS.CANCELLED, cancelledAt: new Date(), cancelledBy: staffId } },
    { new: true }
  );

  // Covers the paid/expired/already-cancelled cases in one answer: whatever it
  // is now, it is no longer a bill anyone can void.
  if (!bill) throw new ApiError(400, "This bill can no longer be cancelled");

  const payload = { billId: String(bill._id), status: bill.status };

  /*
   * The guest is told too — their Pay screen is holding this bill open, and
   * leaving it there would let them pay something the desk has just voided.
   *
   * `byStaff` marks it as somebody else's action. The guest's own cancel emits
   * the same event back to them, so without this flag the app could not tell
   * "the hotel withdrew your bill" (worth a notice) from the echo of a button
   * the guest just pressed themselves (not worth one).
   */
  emitToGuest(bill.guestId, "bill:cancelled", { ...payload, byStaff: true });
  emitToHotel(bill.hotelId, "bill:cancelled", { ...payload, guestId: String(bill.guestId) });

  logger.info(`Bill ${bill._id} cancelled by staff ${staffId} at hotel ${hotelId}`);
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
    // Read off the BILL, never re-resolved from HotelService. A hotel dropping
    // a service to 0% while the guest is at checkout must not reprice a bill
    // already on their screen — the same contract tierCapPercent has always had.
    // `?? null` so a frozen 0 stays 0 rather than falling back.
    coinAllowancePaise: bill.coinAllowancePaise ?? null,
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
              /**
               * Where the money went, for the ledger and the guest's "coins off
               * at the Spa" notification.
               *
               * Taken from the LINES now that staff no longer label the bill
               * itself. Only set when every line agrees: a mixed bill has no one
               * true answer, and picking the biggest line would put a name on
               * the row that the receipt does not support. Undefined is what the
               * notification already handles — it simply drops the "at X".
               */
              outlet: outletFromLines(bill.lineItems),
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
 * Bill activity for a history view — settled, voided and lapsed bills alike.
 *
 * WHY THIS IS NOT THE COIN LEDGER. CoinTransaction is append-only and every
 * row is a coin movement: `coins` and `balanceAfter` are required, and
 * `sum(coins) === membership.balance` is the integrity check the model
 * documents. Two things people expect to see in "history" move no coins at
 * all — a cancelled bill, and a bill paid entirely in cash — so writing them
 * into that ledger would mean inventing zero-coin rows and teaching every
 * revenue and rebate aggregate to filter them out again. The bills collection
 * already holds these facts; this reads them, and the clients merge the two
 * feeds for display.
 *
 * PENDING is excluded deliberately: it is a live bill, not history, and it is
 * already on the guest's Pay screen and the panel's pending list.
 */
const HISTORY_STATUSES = [BILL_STATUS.PAID, BILL_STATUS.CANCELLED, BILL_STATUS.EXPIRED];

export const listBillHistory = async ({ hotelId, guestId, limit = 50 }) => {
  const query = { status: { $in: HISTORY_STATUSES } };
  if (hotelId) query.hotelId = hotelId;
  if (guestId) query.guestId = guestId;

  const bills = await Bill.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit) || 50)))
    .populate("hotelId", "name logoUrl")
    .populate("guestId", "name")
    .populate("cancelledBy", "name role")
    .lean();

  return {
    items: bills.map((bill) => ({
      id: String(bill._id),
      status: bill.status,
      outlet: bill.outlet || null,
      totalPaise: bill.totalPaise,
      coinsApplied: bill.coinsApplied,
      payablePaise: bill.payablePaise,
      hotelName: bill.hotelId?.name || null,
      guestName: bill.guestId?.name || null,
      /**
       * Who voided it, so a guest can tell "I declined this" from "the desk
       * withdrew it" — the two look identical otherwise and the second one
       * reads as the app losing their bill.
       */
      cancelledByRole: bill.cancelledBy?.role || null,
      cancelledByName: bill.cancelledBy?.name || null,
      /**
       * Whether this bill has a REDEEM row in the coin ledger. The clients
       * merge these two feeds, and without this flag a coin-paid bill would
       * appear twice — once as the ledger row, once as the bill.
       */
      hasLedgerRow: Boolean(bill.transactionId),
      paidAt: bill.paidAt || null,
      cancelledAt: bill.cancelledAt || null,
      createdAt: bill.createdAt,
      // The timestamp a merged feed should sort on: when the bill reached the
      // state being shown, not when it was composed.
      at: bill.paidAt || bill.cancelledAt || bill.createdAt,
    })),
  };
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
