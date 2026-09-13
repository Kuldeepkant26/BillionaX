/**
 * Moves services from one coin cap to three, one per tier.
 *
 * The single `coinCapPercent` is COPIED to all three tiers, so no guest's
 * allowance moves: a service at 20% becomes 20/20/20 and every bill prices
 * exactly as it did the day before. Hotels raise the Gold and Platinum numbers
 * when they decide to, which is a commercial choice nobody should make for
 * them by scaling automatically.
 *
 *   node scripts/migrateServiceTierCaps.js --dry   # report only
 *   node scripts/migrateServiceTierCaps.js         # apply
 *
 * Idempotent: a row that already has coinCaps is skipped, so a rerun is safe
 * and a half-finished run can simply be run again.
 *
 * Reads through the raw collection rather than the model, because
 * coinCapPercent is no longer in the schema and Mongoose would not return it.
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { TIERS } from "../src/config/constants.js";
import { HotelService } from "../src/models/hotelService.model.js";

const DRY = process.argv.includes("--dry");

const run = async () => {
  validateEnv();
  await connectDB();

  const raw = mongoose.connection.collection(HotelService.collection.name);
  const rows = await raw.find({}).toArray();

  let migrated = 0;
  let skipped = 0;
  const writes = [];

  for (const row of rows) {
    // Already three-capped. `!= null` rather than a truthy test: a service with
    // every tier at 0 is a real, migrated row.
    if (row.coinCaps && row.coinCaps[TIERS.SILVER] != null) {
      skipped += 1;
      continue;
    }

    // `?? 0` — a row somehow missing the old field is refusing coins, not
    // inheriting a default. Nothing here may invent an allowance.
    const cap = row.coinCapPercent ?? 0;

    writes.push({
      updateOne: {
        filter: { _id: row._id },
        update: {
          $set: {
            coinCaps: {
              [TIERS.SILVER]: cap,
              [TIERS.GOLD]: cap,
              [TIERS.PLATINUM]: cap,
            },
          },
          // The old field goes in the same write, so no row is ever left
          // carrying two sources of truth for the same number.
          $unset: { coinCapPercent: "" },
        },
      },
    });

    migrated += 1;
    logger.info(`${row.name}: ${cap}% -> ${cap}/${cap}/${cap}`);
  }

  if (writes.length && !DRY) await raw.bulkWrite(writes);

  logger.info(`Services: ${rows.length} | migrated: ${migrated} | already done: ${skipped}`);
  if (DRY) logger.warn("Dry run — nothing was written.");

  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error(`Migration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
