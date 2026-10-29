import mongoose from "mongoose";
import { TIERS, TIER_VALUES } from "../config/constants.js";

/**
 * Joins a guest to a hotel. A guest has one global identity (their phone) but a
 * separate coin balance at each hotel, because coins are funded from that
 * hotel's purchased inventory.
 */
const membershipSchema = new mongoose.Schema(
  {
    guestId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },

    balance: { type: Number, default: 0, min: 0 },

    /**
     * Coins promised to bills the guest has started paying but the hotel has
     * not confirmed yet. Spendable = balance − reservedCoins.
     *
     * A hold rather than a debit: `balance` only ever moves together with a
     * ledger row, which is what keeps sum(coins) === balance true. A UPI bill
     * is confirmed by staff minutes after the guest pays, and without this a
     * guest could put the same coins on two bills — the second confirmation
     * would then fail AFTER the money had already reached the hotel.
     *
     * Always equal to the sum of coinsReserved over this membership's PENDING
     * bills; scripts/reconcile.js checks it.
     */
    reservedCoins: { type: Number, default: 0, min: 0 },

    // Tier is derived from nights stayed, never from coins held — a guest
    // cannot buy their way up a tier. See resolveTierByNights.
    tier: { type: String, enum: TIER_VALUES, default: TIERS.SILVER },

    // Nights the hotel has recorded for this guest. The sole input to tier.
    lifetimeNights: { type: Number, default: 0, min: 0 },
    // Room revenue behind those nights. Reporting only; does not affect tier.
    lifetimeSpend: { type: Number, default: 0, min: 0 },

    lifetimeEarned: { type: Number, default: 0 },
    lifetimeRedeemed: { type: Number, default: 0 },

    memberNo: { type: String, required: true },

    joinedAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// The core invariant: one membership per guest per hotel.
membershipSchema.index({ guestId: 1, hotelId: 1 }, { unique: true });
membershipSchema.index({ hotelId: 1, lastActivityAt: -1 });

export const GuestHotelMembership = mongoose.model("GuestHotelMembership", membershipSchema);
