import { Content } from "../models/content.model.js";
import { CONTENT_KINDS, OFFER_GRACE_DAYS } from "../config/constants.js";
import { logger } from "../utils/logger.js";
import { env } from "../config/env.js";
import * as contentService from "./content.service.js";

/**
 * Permanent deletion of long-expired offers.
 *
 * Two mechanisms, deliberately separate:
 *
 *   - Guests stop seeing an offer the INSTANT its deadline passes. That is a
 *     query predicate (offerVisibilityClauses in content.service.js), exact
 *     and immediate, and it is what makes the deadline correct.
 *   - This sweep only reclaims storage afterwards, once the staff grace
 *     period is over. Its timing is not user-visible, so an hourly tick is
 *     ample.
 *
 * NOT a TTL index, for the same reason voucher.model.js records for vouchers,
 * plus a worse one: Mongo's TTL monitor deletes inside the storage engine, so
 * no Mongoose middleware runs — and contentSchema has no delete hook to hang
 * one on. A TTL on `validTo` would drop the row and leave its Cloudinary image
 * paid for forever, with nothing left pointing at it. The TTLs that do exist
 * in this codebase (pendingOtp, notification) delete rows with no external
 * side effects; that is the distinction.
 *
 * An offer with no `validTo` never expires and is never swept.
 */

/** One tick's ceiling. A backlog drains over successive ticks. */
const BATCH = 200;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The instant before which an expired offer is due for deletion.
 *
 * Exported for the tests: the boundary is the whole contract, and it is
 * strict — an offer that expired EXACTLY graceDays ago is not yet due.
 */
export const expiryCutoff = (now = new Date(), graceDays = OFFER_GRACE_DAYS) =>
  new Date(now.getTime() - graceDays * DAY_MS);

/**
 * Deletes offers whose grace period has elapsed, with their images.
 *
 * Returns counts rather than throwing on a single bad row: one hotel's
 * Cloudinary hiccup must not stop the rest of the batch.
 */
export const sweepExpiredOffers = async ({
  now = new Date(),
  graceDays = OFFER_GRACE_DAYS,
  dryRun = false,
} = {}) => {
  const cutoff = expiryCutoff(now, graceDays);

  // $type: "date" (not { $ne: null }) is what keeps this on the partial index
  // declared in content.model.js.
  const due = await Content.find({
    kind: CONTENT_KINDS.OFFER,
    validTo: { $type: "date", $lt: cutoff },
  })
    .select("_id hotelId title validTo imageUrl")
    .limit(BATCH)
    .lean();

  const result = { scanned: due.length, deleted: 0, skipped: 0, failed: 0, items: due };
  if (dryRun || !due.length) return result;

  // Sequential, not Promise.all: 200 parallel Cloudinary destroys is a burst
  // nobody asked for, and this job has no deadline.
  for (const doc of due) {
    try {
      // deleteContent is the ONLY path that also removes the Cloudinary asset.
      // A bulk deleteMany here would be one round trip and orphan every image.
      await contentService.deleteContent({ id: doc._id, hotelId: doc.hotelId });
      result.deleted += 1;
    } catch (error) {
      // findOneAndDelete is atomic, so a second instance racing this one gets
      // a 404 — the row is gone, which is the outcome we wanted. Not an error.
      if (error?.statusCode === 404) result.skipped += 1;
      else {
        result.failed += 1;
        logger.warn(`Offer sweep could not delete ${doc._id}: ${error.message}`);
      }
    }
  }

  if (result.deleted) {
    logger.info(`Offer sweep: deleted ${result.deleted} expired offer(s)`);
  }

  return result;
};

let timer = null;
let running = false;

/**
 * Starts the hourly sweep and returns a function that stops it.
 *
 * The handle is unref()'d so a pending tick can never hold the process open,
 * and `running` guards re-entry in case one sweep outlives its interval.
 */
export const startOfferSweep = ({ intervalMs = HOUR_MS } = {}) => {
  // Tests import services freely; a background job that opens Mongo cursors
  // would make them nondeterministic.
  if (env.nodeEnv === "test" || timer) return () => {};

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepExpiredOffers();
    } catch (error) {
      logger.warn(`Offer sweep failed: ${error.message}`);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  timer.unref?.();

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
};
