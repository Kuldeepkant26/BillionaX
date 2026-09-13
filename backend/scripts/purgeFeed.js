/**
 * Empties the feed: every post, comment, like and save, plus their images.
 *
 *   node scripts/purgeFeed.js --yes        clear the rows, destroy the images
 *   node scripts/purgeFeed.js --yes --keep-assets   rows only
 *
 * DESTRUCTIVE AND NOT REVERSIBLE, hence the required --yes. It hard-deletes
 * rather than tombstoning, because a tombstone exists so that likes and
 * comments pointing at a post stay meaningful — and this removes those too.
 *
 * Images are swept by FOLDER, not by walking the posts. Those two sets differ:
 * an upload that was never posted (the composer was cancelled, or a carousel
 * failed halfway) leaves an asset no row has ever referenced, and walking rows
 * would leave exactly those behind — the orphans this is most useful for.
 */
import mongoose from "mongoose";
import { env, validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { FeedPost } from "../src/models/feedPost.model.js";
import { FeedComment } from "../src/models/feedComment.model.js";
import { FeedPostLike } from "../src/models/feedPostLike.model.js";
import { FeedCommentLike } from "../src/models/feedCommentLike.model.js";
import { FeedSave } from "../src/models/feedSave.model.js";
import { destroyAsset, uploadEnabled } from "../src/services/upload.service.js";

const FOLDER = "feed";

/** Every asset under our feed folder, paged — the Admin API caps a call at 500. */
const listAssets = async () => {
  const auth = Buffer.from(`${env.cloudinary.apiKey}:${env.cloudinary.apiSecret}`).toString("base64");
  const prefix = `${env.cloudinary.folder}/${FOLDER}`;
  const found = [];
  let cursor = null;

  do {
    const url =
      `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/resources/image/upload` +
      `?prefix=${encodeURIComponent(prefix)}&max_results=500` +
      (cursor ? `&next_cursor=${encodeURIComponent(cursor)}` : "");

    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    const body = await response.json();
    if (body.error) throw new Error(body.error.message);

    found.push(...(body.resources || []).map((r) => r.public_id));
    cursor = body.next_cursor || null;
  } while (cursor);

  return found;
};

const run = async () => {
  const args = process.argv.slice(2);
  if (!args.includes("--yes")) {
    logger.error("Refusing to run without --yes. This deletes every feed post permanently.");
    process.exit(1);
  }
  const keepAssets = args.includes("--keep-assets");

  validateEnv();
  await connectDB();

  const before = {
    posts: await FeedPost.countDocuments({}),
    comments: await FeedComment.countDocuments({}),
    likes: await FeedPostLike.countDocuments({}),
    commentLikes: await FeedCommentLike.countDocuments({}),
    saves: await FeedSave.countDocuments({}),
  };
  logger.info(
    `Clearing ${before.posts} posts, ${before.comments} comments, ` +
      `${before.likes + before.commentLikes} likes, ${before.saves} saves`
  );

  // Images first: once the rows are gone their URLs are unrecoverable, and a
  // failure here would strand every asset with nothing left pointing at it.
  if (!keepAssets) {
    if (!uploadEnabled()) {
      logger.warn("Cloudinary is not configured — skipping the image sweep");
    } else {
      const assets = await listAssets();
      logger.info(`Destroying ${assets.length} image(s) under ${env.cloudinary.folder}/${FOLDER}`);
      let gone = 0;
      for (const publicId of assets) {
        // Sequential rather than Promise.all: this is a rate-limited admin API,
        // and a burst of 500 is how you get throttled into a partial sweep.
        if (await destroyAsset(publicId, "image")) gone += 1;
      }
      logger.info(`Destroyed ${gone}/${assets.length}`);
    }
  }

  await Promise.all([
    FeedPost.deleteMany({}),
    FeedComment.deleteMany({}),
    FeedPostLike.deleteMany({}),
    FeedCommentLike.deleteMany({}),
    FeedSave.deleteMany({}),
  ]);

  logger.info("Feed is empty");
  await mongoose.disconnect();
};

run().catch(async (error) => {
  logger.error(`Purge failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
