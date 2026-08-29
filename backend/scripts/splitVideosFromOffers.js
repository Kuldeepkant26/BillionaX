/**
 * One-off migration: give videos their own kind.
 *
 * Before this, a "video" was any CONTENT or OFFER row that happened to carry a
 * videoUrl. That meant an offer with a clip attached appeared BOTH in the
 * offers list and in the video feed, and staff had no single place listing
 * their videos. VIDEO is now its own kind (see config/constants.js).
 *
 * This moves every existing row that has a videoUrl to kind: VIDEO. Rows with
 * only an image are left exactly as they are.
 *
 * Safe to run more than once: rows already on VIDEO no longer match the query.
 *
 *   node scripts/splitVideosFromOffers.js          # report only
 *   node scripts/splitVideosFromOffers.js --apply  # perform the move
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { Content } from "../src/models/content.model.js";
import { CONTENT_KINDS } from "../src/config/constants.js";

config();

const apply = process.argv.includes("--apply");

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const query = {
    kind: { $in: [CONTENT_KINDS.CONTENT, CONTENT_KINDS.OFFER] },
    videoUrl: { $exists: true, $nin: [null, ""] },
  };

  const candidates = await Content.find(query).select("_id kind title hotelId").lean();

  console.log(`\n${candidates.length} row(s) carry a video and would become kind: VIDEO\n`);
  for (const row of candidates) {
    console.log(`  ${row.kind.padEnd(8)} → VIDEO   ${row.title}`);
  }

  if (!candidates.length) {
    console.log("Nothing to migrate.");
  } else if (!apply) {
    console.log("\nDry run. Re-run with --apply to perform the move.");
  } else {
    const result = await Content.updateMany(query, { $set: { kind: CONTENT_KINDS.VIDEO } });
    console.log(`\nMoved ${result.modifiedCount} row(s) to kind: VIDEO.`);
  }

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
