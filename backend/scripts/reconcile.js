/**
 * Ledger integrity check.
 *
 * The CoinTransaction table is the source of truth; membership balances are a
 * cached projection of it. This asserts they still agree:
 *
 *     sum(transactions.coins) === membership.balance
 *
 * A mismatch means a write path updated a balance without writing a ledger row
 * (or vice versa) — investigate before trusting any reporting.
 *
 *   npm run reconcile
 */
import mongoose from "mongoose";
import { validateEnv } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import "../src/models/user.model.js"; // registers User for the populate below
import { GuestHotelMembership } from "../src/models/guestHotelMembership.model.js";
import { CoinTransaction } from "../src/models/coinTransaction.model.js";
import { Hotel } from "../src/models/hotel.model.js";

const run = async () => {
  validateEnv();
  await connectDB();

  const sums = await CoinTransaction.aggregate([
    { $group: { _id: "$membershipId", total: { $sum: "$coins" }, rows: { $sum: 1 } } },
  ]);
  const byMembership = new Map(sums.map((s) => [String(s._id), s]));

  const memberships = await GuestHotelMembership.find().populate("guestId", "name phone");

  let drift = 0;
  for (const m of memberships) {
    const ledger = byMembership.get(String(m._id))?.total ?? 0;
    if (ledger !== m.balance) {
      drift += 1;
      logger.error(
        `DRIFT ${m.memberNo} (${m.guestId?.phone}): balance ${m.balance} vs ledger ${ledger}`
      );
    }
    if (m.balance < 0) {
      drift += 1;
      logger.error(`NEGATIVE BALANCE ${m.memberNo}: ${m.balance}`);
    }
  }

  const hotels = await Hotel.find();
  for (const h of hotels) {
    if (h.coinInventory < 0) {
      drift += 1;
      logger.error(`NEGATIVE INVENTORY ${h.name}: ${h.coinInventory}`);
    }
  }

  const totalOutstanding = memberships.reduce((sum, m) => sum + m.balance, 0);

  logger.info(`Memberships checked: ${memberships.length}`);
  logger.info(`Hotels checked:      ${hotels.length}`);
  logger.info(`Coins outstanding:   ${totalOutstanding.toLocaleString("en-IN")}`);

  if (drift === 0) logger.info("OK — every balance matches its ledger.");
  else logger.error(`${drift} problem(s) found.`);

  await mongoose.connection.close();
  process.exit(drift === 0 ? 0 : 1);
};

run().catch(async (error) => {
  logger.error(`Reconcile failed: ${error.message}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
