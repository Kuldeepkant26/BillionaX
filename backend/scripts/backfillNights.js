/**
 * Migration: tiers move from coins earned to nights stayed.
 *
 * Tier used to be derived from lifetimeEarned, so a guest who was gifted coins
 * could outrank one who actually stayed. It is now derived from
 * lifetimeNights against each hotel's own tierNightThresholds.
 *
 * This script:
 *   1. Seeds lifetimeNights / lifetimeSpend on memberships that predate them,
 *      recovering nights from any STAY (and, with --include-earn, EARN) rows
 *      already in the ledger.
 *   2. Recomputes every membership's tier from those nights.
 *
 * Tier strictly follows nights, so a member with no recorded nights becomes
 * SILVER regardless of their balance. That is the intended rule, but it DOES
 * demote existing members — run with --dry first and read the summary.
 *
 *   node scripts/backfillNights.js --dry           # report only, no writes
 *   node scripts/backfillNights.js                 # apply
 *   node scripts/backfillNights.js --include-earn  # also count old EARN nights
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { TX_TYPES } from "../src/config/constants.js";
import { resolveTierByNights } from "../src/utils/coinMath.js";
import { GuestHotelMembership } from "../src/models/guestHotelMembership.model.js";
import { CoinTransaction } from "../src/models/coinTransaction.model.js";
import { Hotel } from "../src/models/hotel.model.js";

const DRY = process.argv.includes("--dry");

// Old EARN rows carry nights too, but they were priced by the legacy
// room x nights x rate formula rather than a tier rate. Counting them credits
// guests for stays that predate the programme, so it is opt-in.
const INCLUDE_EARN = process.argv.includes("--include-earn");

const run = async () => {
  validateEnv();
  await connectDB();

  const types = INCLUDE_EARN ? [TX_TYPES.STAY, TX_TYPES.EARN] : [TX_TYPES.STAY];

  // Nights already in the ledger, per membership.
  const ledger = await CoinTransaction.aggregate([
    { $match: { type: { $in: types }, nights: { $gt: 0 } } },
    {
      $group: {
        _id: "$membershipId",
        nights: { $sum: "$nights" },
        spend: { $sum: { $ifNull: ["$roomAmount", 0] } },
      },
    },
  ]);
  const byMembership = new Map(ledger.map((row) => [String(row._id), row]));

  const hotels = await Hotel.find().select("name tierNightThresholds").lean();
  const thresholdsFor = new Map(hotels.map((h) => [String(h._id), h.tierNightThresholds]));

  const memberships = await GuestHotelMembership.find()
    .select("hotelId tier lifetimeNights lifetimeSpend")
    .lean();

  let seeded = 0;
  let retiered = 0;
  const moves = new Map();

  for (const m of memberships) {
    const found = byMembership.get(String(m._id));

    // Only seed where the field is absent. A membership that already has
    // nights recorded is live data and must not be overwritten by a rerun.
    const nights = m.lifetimeNights == null ? found?.nights ?? 0 : m.lifetimeNights;
    const spend = m.lifetimeSpend == null ? found?.spend ?? 0 : m.lifetimeSpend;
    const needsSeed = m.lifetimeNights == null || m.lifetimeSpend == null;

    const tier = resolveTierByNights(nights, thresholdsFor.get(String(m.hotelId)));
    const needsRetier = tier !== m.tier;

    if (needsSeed) seeded += 1;
    if (needsRetier) {
      retiered += 1;
      const key = `${m.tier} -> ${tier}`;
      moves.set(key, (moves.get(key) || 0) + 1);
    }

    if (!DRY && (needsSeed || needsRetier)) {
      await GuestHotelMembership.updateOne(
        { _id: m._id },
        { $set: { lifetimeNights: nights, lifetimeSpend: spend, tier } }
      );
    }
  }

  logger.info(`Memberships scanned: ${memberships.length}`);
  logger.info(`Nights seeded from ledger (${types.join(", ")}): ${seeded}`);
  logger.info(`Tier changes: ${retiered}`);
  for (const [move, count] of [...moves].sort()) logger.info(`  ${move}: ${count}`);

  if (DRY) logger.warn("Dry run — nothing was written. Re-run without --dry to apply.");
  else logger.info("Backfill complete.");

  await mongoose.disconnect();
};

run().catch((error) => {
  logger.error(`Backfill failed: ${error.message}`);
  process.exit(1);
});
