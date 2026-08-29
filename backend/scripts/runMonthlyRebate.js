/**
 * Month-end redemption rebate.
 *
 * Credits each hotel a share (redemptionRebatePercent, 50 by default) of the
 * coins guests redeemed there during the period, back into its spendable
 * inventory.
 *
 * Safe to run repeatedly and safe to run from cron alongside the admin panel's
 * "Run now" button: a hotel already settled for the period is skipped, enforced
 * by a unique index rather than by a check in application code.
 *
 * Defaults to the PREVIOUS calendar month, which is what a job firing on the
 * 1st wants. A period that has not finished is refused — settling a partial
 * month would lock it and strand the rest.
 *
 *   node scripts/runMonthlyRebate.js --dry              # report only
 *   node scripts/runMonthlyRebate.js                    # settle last month
 *   node scripts/runMonthlyRebate.js --month=2026-07    # a specific month
 *
 * Suggested cron (03:00 on the 1st):
 *   0 3 1 * * cd /path/to/backend && npm run rebate:month >> logs/rebate.log 2>&1
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { runMonthlyRebate, previousPeriod } from "../src/services/rebate.service.js";

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : undefined;
};

const run = async () => {
  validateEnv();
  await connectDB();

  const period = arg("month") || previousPeriod();
  const dryRun = process.argv.includes("--dry");

  logger.info(`${dryRun ? "[DRY] " : ""}Running rebate for ${period}`);

  const result = await runMonthlyRebate({ period, dryRun });

  logger.info(`Rate applied: ${result.ratePercent}%`);
  for (const row of result.settled) {
    logger.info(
      `  ${row.hotelId}: ${row.coinsRedeemed} redeemed -> ${row.coinsCredited} credited`
    );
  }
  logger.info(
    `${dryRun ? "[DRY] " : ""}${result.settled.length} hotel(s), ` +
      `${result.totalCredited} coins total, ${result.skipped} skipped (already settled)`
  );

  await mongoose.disconnect();
};

run().catch(async (err) => {
  logger.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
