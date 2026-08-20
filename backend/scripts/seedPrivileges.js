/**
 * Gives every existing hotel the default privilege set.
 *
 * New hotels get these from createHotel; this is the one-off backfill for the
 * properties that existed before the feature. Idempotent by title per hotel,
 * so a hotel that already has "Breakfast" is left alone and a rerun adds only
 * what is genuinely missing — edits and hides are never overwritten.
 *
 *   node scripts/seedPrivileges.js --dry   # report only
 *   node scripts/seedPrivileges.js         # apply
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { buildDefaultPrivileges } from "../src/config/defaultContent.js";
import { CONTENT_KINDS } from "../src/config/constants.js";
import { Hotel } from "../src/models/hotel.model.js";
import { Content } from "../src/models/content.model.js";

const DRY = process.argv.includes("--dry");

const run = async () => {
  validateEnv();
  await connectDB();

  const hotels = await Hotel.find().select("name").lean();
  let created = 0;
  let skipped = 0;

  for (const hotel of hotels) {
    const existing = await Content.find({
      hotelId: hotel._id,
      kind: CONTENT_KINDS.PRIVILEGE,
    })
      .select("title")
      .lean();

    const taken = new Set(existing.map((row) => row.title.trim().toLowerCase()));
    const missing = buildDefaultPrivileges(hotel._id).filter(
      (row) => !taken.has(row.title.toLowerCase())
    );

    skipped += buildDefaultPrivileges(hotel._id).length - missing.length;

    if (!missing.length) {
      logger.info(`${hotel.name}: already has all defaults`);
      continue;
    }

    if (!DRY) await Content.insertMany(missing);
    created += missing.length;
    logger.info(`${hotel.name}: +${missing.length} (${missing.map((m) => m.title).join(", ")})`);
  }

  logger.info(`Hotels: ${hotels.length} | created: ${created} | already present: ${skipped}`);
  if (DRY) logger.warn("Dry run — nothing was written.");

  await mongoose.disconnect();
};

run().catch((error) => {
  logger.error(`Seeding privileges failed: ${error.message}`);
  process.exit(1);
});
