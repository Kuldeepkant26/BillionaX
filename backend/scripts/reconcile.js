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
 * And the coin holds that UPI bills place:
 *
 *     sum(coinsReserved of PENDING bills) === membership.reservedCoins
 *
 * A mismatch there means a bill ended without releasing its hold (the guest's
 * spendable balance is stuck short) or a hold was placed without a bill
 * recording it.
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
import { Bill } from "../src/models/bill.model.js";
import { BILL_STATUS } from "../src/config/constants.js";

const run = async () => {
  validateEnv();
  await connectDB();

  const sums = await CoinTransaction.aggregate([
    { $group: { _id: "$membershipId", total: { $sum: "$coins" }, rows: { $sum: 1 } } },
  ]);
  const byMembership = new Map(sums.map((s) => [String(s._id), s]));

  const holds = await Bill.aggregate([
    { $match: { status: BILL_STATUS.PENDING, coinsReserved: { $gt: 0 } } },
    { $group: { _id: "$membershipId", total: { $sum: "$coinsReserved" } } },
  ]);
  const heldBy = new Map(holds.map((h) => [String(h._id), h.total]));

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
    const held = heldBy.get(String(m._id)) ?? 0;
    if (held !== (m.reservedCoins || 0)) {
      drift += 1;
      logger.error(
        `HOLD DRIFT ${m.memberNo} (${m.guestId?.phone}): reservedCoins ${m.reservedCoins || 0} vs pending bills ${held}`
      );
    }
    if ((m.reservedCoins || 0) > m.balance) {
      drift += 1;
      logger.error(`OVER-HELD ${m.memberNo}: ${m.reservedCoins} held of ${m.balance}`);
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

  if (drift === 0) logger.info("OK — every balance matches its ledger, every hold its bills.");
  else logger.error(`${drift} problem(s) found.`);

  await mongoose.connection.close();
  process.exit(drift === 0 ? 0 : 1);
};

run().catch(async (error) => {
  logger.error(`Reconcile failed: ${error.message}`);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
