import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { expireStaleBills } from "./bill.service.js";

/**
 * Relabels bills nobody paid in time.
 *
 * Runs every minute rather than hourly, which is the cadence the offer sweep
 * uses: a guest is standing at a desk while this matters, and a lapsed bill
 * still showing "awaiting payment" on the staff screen ten minutes later is a
 * conversation nobody wants to have. It is also what closes the guest's popup.
 *
 * It never deletes. A bill is the receipt behind a REDEEM ledger row, and the
 * same reasoning keeps a TTL index off the collection — see bill.model.js.
 *
 * Expiry is enforced as a query predicate at read and at payment regardless of
 * this sweep, so a missed tick can delay a label but can never let an expired
 * bill be paid.
 */

const MINUTE_MS = 60_000;

let timer = null;
let running = false;

export const startBillSweep = ({ intervalMs = MINUTE_MS } = {}) => {
  // Tests import services freely; a background job holding Mongo cursors would
  // make them nondeterministic.
  if (env.nodeEnv === "test" || timer) return () => {};

  const tick = async () => {
    // Guards re-entry in case one sweep outlives its interval.
    if (running) return;
    running = true;
    try {
      await expireStaleBills();
    } catch (error) {
      logger.warn(`Bill sweep failed: ${error.message}`);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  // Never let a pending tick hold the process open at shutdown.
  timer.unref?.();

  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
};
