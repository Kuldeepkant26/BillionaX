import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { TIERS, TIER_VALUES, TX_TYPES, NOTIFICATION_KINDS } from "../config/constants.js";
import { resolveTierByNights } from "../utils/coinMath.js";
import { Hotel } from "../models/hotel.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { User } from "../models/user.model.js";
import { getSettings } from "./settings.service.js";
import { destroyAsset, isOwnCloudinaryUrl, publicIdFromUrl } from "./upload.service.js";
import { notify } from "./notification.service.js";
import { emitToGuest } from "../realtime/emitter.js";
import { logger } from "../utils/logger.js";

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
 * Guest edits their own profile.
 *
 * Phone is deliberately NOT editable: it is their login credential and the key
 * linking them to every hotel membership, so a typo would lock them out of
 * their own coins with no password to fall back on.
 */
export const updateGuestProfile = async ({ guestId, name, email, avatarUrl }) => {
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

    // Fire-and-forget: an orphaned file in Cloudinary is a far smaller problem
    // than a profile save that fails because a delete timed out.
    if (previous && previous !== avatarUrl) {
      const publicId = publicIdFromUrl(previous);
      if (publicId) destroyAsset(publicId).catch(() => {});
    }
  }

  if (email !== undefined) {
    const normalized = email ? email.toLowerCase().trim() : undefined;
    if (normalized && (await User.exists({ email: normalized, _id: { $ne: guest._id } }))) {
      throw new ApiError(409, "That email address is already in use", [
        { field: "email", message: "Already in use" },
      ]);
    }
    guest.email = normalized;
  }

  await guest.save();
  return guest.toSafeObject();
};

export const getMembershipsForGuest = async (guestId) =>
  GuestHotelMembership.find({ guestId })
    // tierCaps is needed so the guest app can show their max discount.
    .populate("hotelId", "name slug city logoUrl tierCaps")
    .sort({ lastActivityAt: -1 });

export const getMembershipOrFail = async ({ guestId, hotelId }) => {
  if (!mongoose.isValidObjectId(hotelId)) throw new ApiError(400, "Invalid hotel id");

  const membership = await GuestHotelMembership.findOne({ guestId, hotelId }).populate(
    "hotelId",
    "name slug city logoUrl tierCaps"
  );
  if (!membership) throw new ApiError(404, "You are not a member at this hotel");
  return membership;
};
