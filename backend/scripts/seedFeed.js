/**
 * Seeds demo posts into the global feed.
 *
 * Writes to Mongo DIRECTLY rather than through feed.service.js, and that is
 * deliberate: the service runs assertOwnImages, which requires every URL to be
 * on our own Cloudinary account and returns false for everything when Cloudinary
 * is unconfigured. A seed that went through the service would therefore be
 * unusable on any machine without upload credentials.
 *
 *   node scripts/seedFeed.js
 *
 * Re-runnable: it clears its own rows (matched on the [seed] caption prefix)
 * before inserting, so it never stacks duplicates.
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { User } from "../src/models/user.model.js";
import { FeedPost } from "../src/models/feedPost.model.js";

const SEED_PREFIX = "[seed]";

const run = async () => {
  validateEnv();
  await connectDB();

  const [guest, hotelAdmin, mainAdmin] = await Promise.all([
    User.findOne({ role: "GUEST" }).select("_id name role hotelId").lean(),
    User.findOne({ role: "HOTEL_ADMIN" }).select("_id name role hotelId").lean(),
    User.findOne({ role: "MAIN_ADMIN" }).select("_id name role hotelId").lean(),
  ]);

  const authors = [guest, hotelAdmin, mainAdmin].filter(Boolean);
  if (!authors.length) {
    logger.error("No users found — run scripts/seedDemo.js first");
    await mongoose.disconnect();
    process.exit(1);
  }

  for (const a of authors) logger.info(`Author: ${a.name} (${a.role})`);

  const removed = await FeedPost.deleteMany({ caption: new RegExp(`^\\${SEED_PREFIX}`) });
  if (removed.deletedCount) logger.info(`Cleared ${removed.deletedCount} previous seed posts`);

  const img = (n) =>
    `https://res.cloudinary.com/demo/image/upload/v1/billionax/feed/seed_${n}.jpg`;

  const rows = [];
  for (let i = 1; i <= 15; i += 1) {
    const who = authors[i % authors.length];
    // A spread of carousel lengths, so the client's dots and snap behaviour get
    // exercised by the seed rather than only by a hand-made post.
    const count = i % 4 === 0 ? 3 : i % 7 === 0 ? 5 : 1;
    rows.push({
      authorId: who._id,
      authorRole: who.role,
      authorHotelId: who.hotelId || null,
      images: Array.from({ length: count }, (_, k) => img(`${i}_${k}`)),
      caption: `${SEED_PREFIX} post ${i} by ${who.role}`,
      // Spaced a minute apart so cursor pagination has a stable ordering to walk.
      createdAt: new Date(Date.now() - i * 60_000),
      updatedAt: new Date(Date.now() - i * 60_000),
    });
  }

  // timestamps: false so the hand-set createdAt above survives the insert.
  const made = await FeedPost.insertMany(rows, { timestamps: false });
  logger.info(`Inserted ${made.length} feed posts`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error(`Seed failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
