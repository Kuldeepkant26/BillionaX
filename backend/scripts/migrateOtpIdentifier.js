/**
 * Migration: OTP challenges move from `phone` to `identifier` + `channel`.
 *
 * Guests now sign in with an email address, so the pendingotps collection is
 * keyed on a generic identifier rather than a phone number.
 *
 * The part that actually matters is the INDEX. The old unique index on
 * {phone, purpose} survives a schema change — Mongo does not drop indexes
 * because a Mongoose model stopped mentioning the field. Left in place, every
 * new challenge writes phone: null, and the SECOND one collides on the unique
 * index: one guest can request a code, and nobody else can until it expires.
 *
 * Pending rows themselves are throwaway (they expire in minutes), so they are
 * simply cleared rather than carefully converted.
 *
 *   node scripts/migrateOtpIdentifier.js --dry   # report only, no writes
 *   node scripts/migrateOtpIdentifier.js         # apply
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";

const dry = process.argv.includes("--dry");

const run = async () => {
  validateEnv();
  await connectDB();

  const collection = mongoose.connection.db.collection("pendingotps");
  const indexes = await collection.indexes();

  logger.info(`Found ${indexes.length} index(es) on pendingotps:`);
  for (const ix of indexes) logger.info(`  ${ix.name} -> ${JSON.stringify(ix.key)}`);

  // Any unique index mentioning `phone` is the stale one.
  const stale = indexes.filter((ix) => "phone" in (ix.key || {}));
  const pending = await collection.countDocuments();

  if (dry) {
    logger.info(`[DRY] would drop ${stale.length} stale index(es): ${stale.map((i) => i.name).join(", ") || "none"}`);
    logger.info(`[DRY] would clear ${pending} pending challenge(s)`);
    await mongoose.disconnect();
    return;
  }

  for (const ix of stale) {
    await collection.dropIndex(ix.name);
    logger.info(`Dropped stale index ${ix.name}`);
  }

  if (pending) {
    await collection.deleteMany({});
    logger.info(`Cleared ${pending} pending challenge(s) — guests simply request a new code`);
  }

  // Rebuild from the model so the new {identifier, purpose} unique index and
  // the TTL both exist before the first login attempt.
  const { PendingOtp } = await import("../src/models/pendingOtp.model.js");
  await PendingOtp.syncIndexes();
  logger.info("Rebuilt indexes from the current schema");

  await mongoose.disconnect();
  logger.info("Done");
};

run().catch(async (err) => {
  logger.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
