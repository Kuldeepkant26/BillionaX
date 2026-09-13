/**
 * Feed counter integrity check and repair.
 *
 * FeedPost.likeCount / commentCount and FeedComment.likeCount / replyCount are
 * materialised — maintained with $inc rather than counted on read, because a
 * per-page aggregate over an unbounded like collection is the wrong shape for
 * the app's busiest screen (see feedPost.model.js).
 *
 * The join rows are the source of truth. A process that dies between inserting
 * one and applying its $inc leaves the counter low, and nothing notices: a
 * wrong number looks exactly like a right one. That is the price of
 * materialising, and this script is how it is paid.
 *
 *   node scripts/recountFeed.js          report drift, change nothing
 *   node scripts/recountFeed.js --fix    repair every counter that disagrees
 *
 * Counts are recomputed with $group aggregates over the whole collection rather
 * than per row, so this stays one pass regardless of how many posts exist.
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { FeedPost } from "../src/models/feedPost.model.js";
import { FeedPostLike } from "../src/models/feedPostLike.model.js";
import { FeedComment } from "../src/models/feedComment.model.js";
import { FeedCommentLike } from "../src/models/feedCommentLike.model.js";

/** A Map of id -> count, from a $group over the whole collection. */
const countBy = async (Model, groupField, match = {}) => {
  const rows = await Model.aggregate([
    { $match: match },
    { $group: { _id: `$${groupField}`, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
};

/**
 * Compares stored counters against the truth and optionally repairs them.
 * Returns how many rows disagreed.
 */
const check = async ({ Model, label, fields, fix }) => {
  const docs = await Model.find({}).select(Object.keys(fields).join(" ")).lean();
  const writes = [];

  for (const doc of docs) {
    const wrong = {};
    for (const [field, truth] of Object.entries(fields)) {
      const actual = truth.get(String(doc._id)) || 0;
      if ((doc[field] || 0) !== actual) wrong[field] = actual;
    }

    if (Object.keys(wrong).length) {
      const before = Object.keys(wrong)
        .map((f) => `${f} ${doc[f] || 0}->${wrong[f]}`)
        .join(", ");
      logger.warn(`${label} ${doc._id}: ${before}`);
      writes.push({ updateOne: { filter: { _id: doc._id }, update: { $set: wrong } } });
    }
  }

  if (writes.length && fix) {
    await Model.bulkWrite(writes);
    logger.info(`Repaired ${writes.length} ${label} row(s)`);
  }

  return writes.length;
};

const run = async () => {
  const fix = process.argv.includes("--fix");

  validateEnv();
  await connectDB();

  const [postLikes, postComments, commentLikes, commentReplies] = await Promise.all([
    countBy(FeedPostLike, "postId"),
    // Replies count toward the post's total: the number beside the comment icon
    // means "how much conversation is on this post", which is what a reader
    // takes it to mean. Tombstones are excluded, matching every read path.
    countBy(FeedComment, "postId", { isDeleted: false }),
    countBy(FeedCommentLike, "commentId"),
    countBy(FeedComment, "parentId", { isDeleted: false, parentId: { $ne: null } }),
  ]);

  const drifted =
    (await check({
      Model: FeedPost,
      label: "post",
      fields: { likeCount: postLikes, commentCount: postComments },
      fix,
    })) +
    (await check({
      Model: FeedComment,
      label: "comment",
      fields: { likeCount: commentLikes, replyCount: commentReplies },
      fix,
    }));

  if (!drifted) logger.info("No drift — every feed counter agrees with its join rows");
  else if (!fix) logger.warn(`${drifted} row(s) drifted. Re-run with --fix to repair.`);

  await mongoose.disconnect();
  // Non-zero on unrepaired drift, so this is usable as a monitoring check.
  process.exit(drifted && !fix ? 1 : 0);
};

run().catch(async (error) => {
  logger.error(`Recount failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
