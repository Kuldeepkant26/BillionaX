/**
 * Gives every existing hotel the default service set.
 *
 * New hotels get these from createHotel; this is the one-off backfill for the
 * properties that existed before services did. Idempotent by name per hotel
 * (case-insensitively, matching the unique index), so a hotel that already has
 * "Spa" is left alone and a rerun adds only what is genuinely missing — renames,
 * re-rates and hides are never overwritten.
 *
 * Each hotel's services seed at ITS OWN Silver cap, so its guests keep the
 * allowance they have today the moment staff start tagging lines.
 *
 *   node scripts/seedServices.js --dry   # report only
 *   node scripts/seedServices.js         # apply
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { buildDefaultServices } from "../src/config/defaultServices.js";
import { Hotel } from "../src/models/hotel.model.js";
import { HotelService } from "../src/models/hotelService.model.js";

const DRY = process.argv.includes("--dry");

const run = async () => {
  validateEnv();
  await connectDB();

  // tierCaps is selected because the seed rate comes from it.
  const hotels = await Hotel.find().select("name tierCaps").lean();
  let created = 0;
  let skipped = 0;

  for (const hotel of hotels) {
    const existing = await HotelService.find({ hotelId: hotel._id }).select("name").lean();
    const taken = new Set(existing.map((row) => row.name.trim().toLowerCase()));

    const defaults = buildDefaultServices(hotel);
    const missing = defaults.filter((row) => !taken.has(row.name.toLowerCase()));

    skipped += defaults.length - missing.length;

    if (!missing.length) {
      logger.info(`${hotel.name}: already has all defaults`);
      continue;
    }

    if (!DRY) await HotelService.insertMany(missing);
    created += missing.length;
    const caps = missing[0].coinCaps;
    logger.info(
      `${hotel.name}: +${missing.length} at ${caps.SILVER}/${caps.GOLD}/${caps.PLATINUM}% ` +
        `(${missing.map((m) => m.name).join(", ")})`
    );
  }

  logger.info(`Hotels: ${hotels.length} | created: ${created} | already present: ${skipped}`);
  if (DRY) logger.warn("Dry run — nothing was written.");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error(`Seeding services failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
