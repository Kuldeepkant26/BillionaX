import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { TIERS, TIER_VALUES, TX_TYPES, NOTIFICATION_KINDS } from "../config/constants.js";
import { resolveTierByNights } from "../utils/coinMath.js";
import { Hotel } from "../models/hotel.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { HotelService } from "../models/hotelService.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { User } from "../models/user.model.js";
import { getSettings } from "./settings.service.js";
import { destroyAsset, isOwnCloudinaryUrl, publicIdFromUrl } from "./upload.service.js";
import { notify } from "./notification.service.js";
import { emitToGuest } from "../realtime/emitter.js";
import { logger } from "../utils/logger.js";
import { mergeGuestAccounts } from "./accountMerge.service.js";
import { normalizePhone } from "./otp.service.js";

const buildMemberNo = (hotelSlug, guestId) => {
  const prefix = (hotelSlug || "gw").slice(0, 3).toUpperCase();
  return `GW-${prefix}-${String(guestId).slice(-6).toUpperCase()}`;
};

export const findHotelByQr = async ({ slug, qrToken }) => {
  const query = qrToken ? { qrToken } : { slug: String(slug || "").toLowerCase() };
  const hotel = await Hotel.findOne({ ...query, isActive: true });
  if (!hotel) throw new ApiError(404, "Hotel not found");
  return hotel;
};

/**
 * Joins a guest to a hotel, creating the membership if it does not exist.
 *
 * The welcome credit is granted once per PERSON across the whole platform
 * (User.welcomeCreditClaimed), not once per hotel. Those coins come out of the
 * joined hotel's purchased inventory, so the inventory decrement is guarded.
 */
export const joinHotel = async ({ guestId, hotel }) => {
  const existing = await GuestHotelMembership.findOne({ guestId, hotelId: hotel._id });
  if (existing) return { membership: existing, created: false, welcomeCoins: 0 };

  const membership = await GuestHotelMembership.create({
    guestId,
    hotelId: hotel._id,
    memberNo: buildMemberNo(hotel.slug, guestId),
    balance: 0,
    tier: TIERS.SILVER,
  });

  const welcomeCoins = await grantWelcomeCreditIfEligible({ guestId, hotel, membership });

  const fresh = await membership.constructor.findById(membership._id);

  // Emitted from joinHotel rather than the private grantWelcomeCredit helper:
  // this point is outside allocateCoins' compensating-rollback window, so a
  // failed allocation cannot leave a notice for coins that were refunded.
  if (welcomeCoins > 0) {
    await notify({
      guestId,
      hotelId: hotel._id,
      kind: NOTIFICATION_KINDS.HOTEL_JOINED,
      title: `Welcome to ${hotel.name}`,
      body: `${welcomeCoins.toLocaleString("en-IN")} welcome coins are in your account.`,
      href: "/app",
      // allocateCoins calls joinHotel, so a retried allocation must not
      // produce a second welcome notice.
      dedupeKey: `join:${guestId}:${hotel._id}`,
    });
    emitToGuest(guestId, "balance:changed", {
      hotelId: hotel._id,
      balance: fresh.balance,
      delta: welcomeCoins,
    });
  }

  return { membership: fresh, created: true, welcomeCoins };
};

/**
 * Grants the one-time welcome credit. Returns 0 if the guest already claimed it
 * anywhere on the platform, or if the hotel has insufficient inventory.
 */
const grantWelcomeCreditIfEligible = async ({ guestId, hotel, membership }) => {
  const settings = await getSettings();
  const coins = settings.welcomeCredit;
  if (!(coins > 0)) return 0;

  // Atomic claim: only the first attempt flips false -> true, so concurrent
  // joins at two hotels cannot both grant the welcome credit.
  const claimed = await User.findOneAndUpdate(
    { _id: guestId, welcomeCreditClaimed: false },
    { $set: { welcomeCreditClaimed: true } },
    { new: true }
  );
  if (!claimed) return 0;

  // Inventory guard: the predicate IS the filter, so it cannot go negative.
  const funded = await Hotel.findOneAndUpdate(
    { _id: hotel._id, coinInventory: { $gte: coins } },
    { $inc: { coinInventory: -coins, totalCoinsAllocated: coins } },
    { new: true }
  );

  if (!funded) {
    // Hotel cannot fund it — release the claim so the guest keeps eligibility.
    await User.updateOne({ _id: guestId }, { $set: { welcomeCreditClaimed: false } });

    // Loud on purpose. This path used to return 0 in silence, so an
    // underfunded hotel quietly stopped welcoming guests with no error
    // anywhere — a support call with no trail.
    logger.warn(
      `Welcome credit skipped: ${hotel.name} (${hotel._id}) has ${hotel.coinInventory} coins, needs ${coins}`
    );
    return 0;
  }

  const updated = await GuestHotelMembership.findOneAndUpdate(
    { _id: membership._id },
    { $inc: { balance: coins, lifetimeEarned: coins }, $set: { lastActivityAt: new Date() } },
    { new: true }
  );

  await CoinTransaction.create({
    type: TX_TYPES.WELCOME,
    guestId,
    hotelId: hotel._id,
    membershipId: membership._id,
    coins,
    balanceAfter: updated.balance,
    note: "Welcome credit",
  });

  return coins;
};

/**
 * Recomputes tier from nights stayed at this hotel.
 *
 * Coins deliberately play no part: a guest who is gifted or buys a large
 * balance must not outrank one who actually stayed. Thresholds come from the
 * hotel, so each property sets its own bar for Gold and Platinum.
 */
export const refreshTier = async (membershipId) => {
  const membership = await GuestHotelMembership.findById(membershipId);
  if (!membership) return null;

  const hotel = await Hotel.findById(membership.hotelId).select("name tierNightThresholds");
  if (!hotel) return membership;

  const tier = resolveTierByNights(membership.lifetimeNights, hotel.tierNightThresholds);
  if (tier === membership.tier) return membership;

  const previous = membership.tier;
  membership.tier = tier;
  await membership.save();

  // Only celebrate upgrades, not the downgrade a negative adjustment can cause.
  const ranks = TIER_VALUES;
  if (ranks.indexOf(tier) > ranks.indexOf(previous)) {
    await notify({
      guestId: membership.guestId,
      hotelId: membership.hotelId,
      kind: NOTIFICATION_KINDS.TIER_UP,
      title: `You reached ${tier}`,
      body: `You can now redeem a bigger share of your bill${hotel?.name ? ` at ${hotel.name}` : ""}.`,
      href: "/app",
      meta: { tier, previous },
      // One notice per membership per tier, even if two credits race.
      dedupeKey: `tier:${membership._id}:${tier}`,
    });
  }

  return membership;
};

/**
 * Re-evaluates every member of a hotel against its current night thresholds.
 * Called when a hotel admin moves the bars, so the change applies to the
 * members who already stayed rather than only to future stays.
 *
 * Returns how many memberships actually changed tier.
 */
export const retierHotelMembers = async (hotelId) => {
  const hotel = await Hotel.findById(hotelId).select("name tierNightThresholds");
  if (!hotel) return 0;

  const members = await GuestHotelMembership.find({ hotelId }).select("tier lifetimeNights");

  let changed = 0;
  for (const member of members) {
    const tier = resolveTierByNights(member.lifetimeNights, hotel.tierNightThresholds);
    if (tier === member.tier) continue;
    // refreshTier owns the upgrade notification and the rank comparison, so the
    // guest hears about a promotion here exactly as they would after a stay.
    await refreshTier(member._id);
    changed += 1;
  }

  return changed;
};

/**
 * Adds a mobile number to a guest account that does not have one yet.
 *
 * This matters more than a profile field normally would. Hotel staff award
 * coins by typing a phone number at checkout, creating a guest record on the
 * spot if the number is unknown — so a guest who earns coins before linking
 * their number has a second account holding them. Linking is the moment the
 * two are known to be the same person, so it is where they are merged.
 *
 * Set once, never edited: it is a login credential and the key to every
 * membership, so a typo later would lock the guest out of their own coins with
 * no password to fall back on. Changing it is a support action.
 */
const linkPhone = async (guest, rawPhone) => {
  const phone = normalizePhone(rawPhone);

  if (!/^[6-9]\d{9}$/.test(phone)) {
    throw new ApiError(400, "Enter a valid 10-digit mobile number", [
      { field: "phone", message: "Enter a valid 10-digit mobile number" },
    ]);
  }

  if (guest.phone) {
    if (guest.phone === phone) return { coinsMoved: 0 };
    throw new ApiError(409, "Your mobile number is already set. Contact the hotel to change it.", [
      { field: "phone", message: "Already set" },
    ]);
  }

  const existing = await User.findOne({ phone });

  // Nobody holds it — the guest simply takes it.
  if (!existing) {
    guest.phone = phone;
    return { coinsMoved: 0 };
  }

  if (String(existing._id) === String(guest._id)) return { coinsMoved: 0 };

  // Someone holds it. mergeGuestAccounts absorbs it ONLY if it is an unclaimed
  // shell created by staff; anything else is a real person and it refuses,
  // rather than handing over their balance.
  const { coinsMoved } = await mergeGuestAccounts({
    sourceId: existing._id,
    targetId: guest._id,
  });

  // Re-read: the merge may have set welcomeCreditClaimed or the name, and this
  // in-memory copy would otherwise overwrite that on save.
  const fresh = await User.findById(guest._id);
  guest.welcomeCreditClaimed = fresh.welcomeCreditClaimed;
  guest.name = fresh.name;

  guest.phone = phone;
  return { coinsMoved };
};

/**
 * Guest edits their own profile.
 */
export const updateGuestProfile = async ({ guestId, name, email, phone, avatarUrl }) => {
  const guest = await User.findById(guestId);
  if (!guest) throw new ApiError(404, "Account not found");

  if (name) guest.name = name.trim();

  if (avatarUrl !== undefined) {
    // The upload happens in the browser, so this URL is client-supplied.
    // Anything not on our own Cloudinary account is refused — otherwise a
    // guest could point their avatar at any host and have every screen that
    // renders them fetch it.
    if (avatarUrl && !isOwnCloudinaryUrl(avatarUrl)) {
      throw new ApiError(400, "That image could not be verified", [
        { field: "avatarUrl", message: "Unrecognised image source" },
      ]);
    }

    const previous = guest.avatarUrl;
    guest.avatarUrl = avatarUrl || undefined;

    // Compare public_ids, NOT URLs. Every avatar for a given guest uploads to
    // the same public_id, so a re-upload OVERWRITES the old file and the two
    // URLs differ only by version — deleting on that difference would destroy
    // the picture that was just saved, leaving the profile pointing at a 404.
    //
    // Fire-and-forget: an orphaned file in Cloudinary is a far smaller problem
    // than a profile save that fails because a delete timed out.
    const previousId = publicIdFromUrl(previous);
    const nextId = publicIdFromUrl(guest.avatarUrl);

    if (previousId && previousId !== nextId) {
      destroyAsset(previousId).catch(() => {});
    }
  }

  if (email !== undefined) {
    const normalized = email ? email.toLowerCase().trim() : undefined;

    // Guests sign in with their email, so clearing it would lock them out of
    // their own account with no password to fall back on.
    if (!normalized && guest.email) {
      throw new ApiError(400, "Your email address is how you sign in and cannot be removed", [
        { field: "email", message: "Required" },
      ]);
    }

    if (normalized && (await User.exists({ email: normalized, _id: { $ne: guest._id } }))) {
      throw new ApiError(409, "That email address is already in use", [
        { field: "email", message: "Already in use" },
      ]);
    }
    guest.email = normalized;
  }

  // Last, so a merge cannot run and then be undone by a later validation
  // failure in this same call.
  let coinsMoved = 0;
  if (phone !== undefined && phone !== null && phone !== "") {
    ({ coinsMoved } = await linkPhone(guest, phone));
  }

  await guest.save();
  return { ...guest.toSafeObject(), coinsMoved };
};

// tierCaps is needed so the guest app can show their max discount, and
// tierEarnRates so the "how it works" explainer on home can quote the rate
// this guest actually earns rather than a marketing figure.
const HOTEL_FIELDS = "name slug city logoUrl tierCaps tierEarnRates earnRatePercent";

/**
 * The best coin rate a guest can actually get at each of their hotels.
 *
 * The tier cap is only the fallback for a line nobody tagged; what a guest can
 * genuinely save is the HIGHEST rate their tier gets across that hotel's
 * services. Quoting the tier cap as their maximum understates it wherever a
 * hotel has set a service above it — which is the whole point of per-service
 * caps — so the home screen would tell a Platinum guest "save 10%" at a hotel
 * offering them 50% at the restaurant.
 *
 * One aggregate across every hotel the guest belongs to, keyed by hotel and
 * tier, rather than a query per membership.
 *
 * Only ACTIVE services count: a hidden one cannot be billed to, so promising
 * its rate would be promising something unreachable.
 */
const bestServiceCapByHotel = async (memberships) => {
  const hotelIds = memberships.map((m) => m.hotelId?._id || m.hotelId).filter(Boolean);

  if (!hotelIds.length) return new Map();

  const rows = await HotelService.aggregate([
    { $match: { hotelId: { $in: hotelIds }, isActive: true } },
    {
      $group: {
        _id: "$hotelId",
        SILVER: { $max: "$coinCaps.SILVER" },
        GOLD: { $max: "$coinCaps.GOLD" },
        PLATINUM: { $max: "$coinCaps.PLATINUM" },
      },
    },
  ]);

  return new Map(rows.map((r) => [String(r._id), r]));
};

export const getMembershipsForGuest = async (guestId) => {
  const memberships = await GuestHotelMembership.find({ guestId })
    .populate("hotelId", HOTEL_FIELDS)
    .sort({ lastActivityAt: -1 })
    .lean();

  const best = await bestServiceCapByHotel(memberships);

  return memberships.map((m) => {
    const caps = best.get(String(m.hotelId?._id || m.hotelId));
    const serviceCap = caps?.[m.tier];
    const tierCap = m.hotelId?.tierCaps?.[m.tier];

    return {
      ...m,
      /**
       * The headline "save up to" figure for this guest at this hotel.
       *
       * The larger of their tier cap and their best service rate, because both
       * are genuinely reachable: an untagged line prices at the tier cap, and a
       * line tagged to the best service prices at that. `??` at each step — a
       * hotel that has set every service to 0 means it, and a falsy test would
       * quietly fall back to the tier cap it deliberately overrode.
       */
      maxSavePercent: Math.max(serviceCap ?? 0, tierCap ?? 0),
    };
  });
};

export const getMembershipOrFail = async ({ guestId, hotelId }) => {
  if (!mongoose.isValidObjectId(hotelId)) throw new ApiError(400, "Invalid hotel id");

  const membership = await GuestHotelMembership.findOne({ guestId, hotelId }).populate(
    "hotelId",
    HOTEL_FIELDS
  );
  if (!membership) throw new ApiError(404, "You are not a member at this hotel");
  return membership;
};
