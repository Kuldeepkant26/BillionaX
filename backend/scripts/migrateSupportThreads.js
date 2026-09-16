/**
 * Migration: support messages gain a channel, and their owner field is renamed.
 *
 * Hotel admins can now open their own support threads with the platform team,
 * so the collection holds two channels instead of one. That meant:
 *
 *   guestId  -> userId    (the thread's owner is no longer always a guest)
 *   adminId  -> authorId  (now set on BOTH sides, not just the platform's)
 *   + party             ("GUEST" for every existing row)
 *   + hotelId           (null on guest threads)
 *
 * Existing rows are real support history, so they are CONVERTED rather than
 * cleared — unlike the throwaway OTP rows in migrateOtpIdentifier.js.
 *
 * The part that actually matters is the INDEXES. Mongo does not drop an index
 * because a Mongoose schema stopped mentioning the field, so the old
 * {guestId, createdAt} and {sender, guestId} indexes survive this rename and
 * then index a field no document has any more. Worse, every unread query would
 * fall back to a collection scan while the stale partial index sits there
 * looking like coverage.
 *
 *   node scripts/migrateSupportThreads.js --dry   # report only, no writes
 *   node scripts/migrateSupportThreads.js         # apply
 *
 * Safe to run twice: the rename matches only rows that still have guestId, and
 * syncIndexes is idempotent.
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";

const dry = process.argv.includes("--dry");

const run = async () => {
  validateEnv();
  await connectDB();

  const collection = mongoose.connection.db.collection("supportmessages");

  const total = await collection.countDocuments();
  const legacy = await collection.countDocuments({ guestId: { $exists: true } });
  const indexes = await collection.indexes();
  // Any index mentioning the old owner field is stale after the rename.
  const stale = indexes.filter((ix) => "guestId" in (ix.key || {}));

  logger.info(`supportmessages: ${total} row(s), ${legacy} still on the old shape`);
  for (const ix of indexes) logger.info(`  ${ix.name} -> ${JSON.stringify(ix.key)}`);

  if (dry) {
    logger.info(`[DRY] would convert ${legacy} row(s) to the guest channel`);
    logger.info(
      `[DRY] would drop ${stale.length} stale index(es): ${
        stale.map((i) => i.name).join(", ") || "none"
      }`
    );
    await mongoose.disconnect();
    return;
  }

  if (legacy) {
    // $rename moves the values; $set fills the two new fields. Every existing
    // thread predates the hotel channel, so all of them are guest threads.
    const { modifiedCount } = await collection.updateMany(
      { guestId: { $exists: true } },
      {
        $rename: { guestId: "userId", adminId: "authorId" },
        $set: { party: "GUEST", hotelId: null },
      }
    );
    logger.info(`Converted ${modifiedCount} row(s) to the guest channel`);

    /*
     * Backfill authorId on the owner's own messages.
     *
     * The old shape left adminId null on a guest's own rows, because there was
     * only ever one possible author. authorId now means "who typed this" on
     * both sides, so a null on an owner row would read as "unknown author"
     * rather than "the guest". On a guest thread that is invisible, but it
     * would be wrong if these rows were ever grouped by author.
     */
    const { modifiedCount: authored } = await collection.updateMany(
      { sender: "GUEST", authorId: null },
      [{ $set: { authorId: "$userId" } }]
    );
    logger.info(`Backfilled authorId on ${authored} owner message(s)`);
  }

  for (const ix of stale) {
    await collection.dropIndex(ix.name);
    logger.info(`Dropped stale index ${ix.name}`);
  }

  // Rebuild from the model so the new {userId, createdAt}, {party, createdAt}
  // and the {party, sender, userId} partial index all exist.
  const { SupportMessage } = await import("../src/models/supportMessage.model.js");
  await SupportMessage.syncIndexes();
  logger.info("Rebuilt indexes from the current schema");

  await mongoose.disconnect();
  logger.info("Done");
};

run().catch(async (err) => {
  logger.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
