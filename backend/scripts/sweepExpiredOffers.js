/**
 * Deletes offers whose grace period has elapsed, with their Cloudinary images.
 *
 * The app already runs this hourly (see services/offerExpiry.service.js). This
 * script is the manual handle: a dry run to see what WOULD go, and an --apply
 * to force a pass without waiting for the next tick.
 *
 *   node scripts/sweepExpiredOffers.js          # report only
 *   node scripts/sweepExpiredOffers.js --apply  # delete
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { sweepExpiredOffers, expiryCutoff } from "../src/services/offerExpiry.service.js";
import { OFFER_GRACE_DAYS } from "../src/config/constants.js";

config();

const apply = process.argv.includes("--apply");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const cutoff = expiryCutoff();
  console.log(
    `\nGrace period ${OFFER_GRACE_DAYS} days — deleting offers that ended before ${cutoff.toISOString()}\n`
  );

  const preview = await sweepExpiredOffers({ dryRun: true });

  if (!preview.scanned) {
    console.log("Nothing is due for deletion.");
    await mongoose.disconnect();
    return;
  }

  for (const row of preview.items) {
    console.log(`  ${row.validTo.toISOString().slice(0, 10)}  ${row.title}`);
  }

  if (!apply) {
    console.log(`\n${preview.scanned} offer(s) due. Re-run with --apply to delete them.`);
  } else {
    const result = await sweepExpiredOffers();
    console.log(
      `\nDeleted ${result.deleted}, skipped ${result.skipped}, failed ${result.failed}.`
    );
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
