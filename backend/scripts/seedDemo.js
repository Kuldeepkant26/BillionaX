/**
 * Wipes the platform and seeds four demo hotels.
 *
 *   node scripts/seedDemo.js --wipe --i-understand-this-deletes-everything --db=<name>
 *
 * DESTRUCTIVE AND IRREVERSIBLE. MONGO_URI points at a live Atlas cluster and
 * there is no local fallback — everything except the protected superadmin is
 * deleted permanently.
 *
 * Everything is created THROUGH THE SERVICES rather than by writing documents
 * directly. That keeps balanceAfter, lifetimeEarned, tier and memberNo correct
 * by construction; hand-written ledger rows would break reconcile.js on the
 * first mistake, and the point of demo data is that it must be valid.
 */
import readline from "node:readline/promises";
import mongoose from "mongoose";
import { env, validateEnv, isProduction } from "../src/config/env.js";
import { connectDB } from "../src/config/db.js";
import { logger } from "../src/utils/logger.js";
import { ROLES, CONTENT_KINDS, OUTLETS } from "../src/config/constants.js";

import { User } from "../src/models/user.model.js";
import { Hotel } from "../src/models/hotel.model.js";
import { Content } from "../src/models/content.model.js";
import { Voucher } from "../src/models/voucher.model.js";
import { PendingOtp } from "../src/models/pendingOtp.model.js";
import { CoinPurchase } from "../src/models/coinPurchase.model.js";
import { CoinTransaction } from "../src/models/coinTransaction.model.js";
import { GuestHotelMembership } from "../src/models/guestHotelMembership.model.js";
import { PlatformSettings } from "../src/models/platformSettings.model.js";

import * as hotelService from "../src/services/hotel.service.js";
import * as coinService from "../src/services/coin.service.js";
import * as contentService from "../src/services/content.service.js";
import * as voucherService from "../src/services/voucher.service.js";
import { joinHotel } from "../src/services/membership.service.js";

const HELP = `
Billionax demo seeder — DESTRUCTIVE

  Deletes every hotel, guest, membership, ledger row, purchase, voucher and
  content item. Keeps ONLY the protected superadmin and PlatformSettings.
  Then seeds 4 demo hotels with staff, inventory, guests and history.

  Usage:
    node scripts/seedDemo.js --wipe \\
      --i-understand-this-deletes-everything \\
      --db=<database-name>

  The --db value must match the database in MONGO_URI. That is the guard that
  catches the real accident: pointing at the wrong cluster.
`;

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const fail = (message) => {
  logger.error(message);
  process.exit(1);
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads the database name out of the connection string. */
const dbNameFromUri = (uri) => {
  const withoutQuery = uri.split("?")[0];
  const afterHost = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  return afterHost || "";
};

const guard = () => {
  if (!has("--wipe")) {
    console.log(HELP);
    process.exit(0);
  }
  if (!has("--i-understand-this-deletes-everything")) {
    fail("Refusing: missing --i-understand-this-deletes-everything");
  }
  if (isProduction) fail("Refusing: NODE_ENV=production.");

  const actual = dbNameFromUri(env.mongoUri);
  const confirmed = argv.find((a) => a.startsWith("--db="))?.slice(5);
  if (!confirmed) fail(`Refusing: pass --db=${actual} to confirm the target database.`);
  if (confirmed !== actual) {
    fail(`Refusing: --db=${confirmed} does not match the URI's database (${actual}).`);
  }
  return actual;
};

// ---------------------------------------------------------------- demo data

const HOTELS = [
  {
    name: "The Chandratal Palace",
    slug: "chandratal-palace",
    city: "Udaipur",
    address: "Lake Pichola Road, Udaipur, Rajasthan 313001",
    phone: "0294 242 8100",
    email: "reception@chandratalpalace.in",
    earnRatePercent: 12,
    tierCaps: { SILVER: 10, GOLD: 18, PLATINUM: 25 },
    pack: { coins: 250_000, amountPaid: 225_000, ref: "PACK-SCALE" },
    content: [
      { title: "Lakeside heritage suites", description: "Forty rooms facing Lake Pichola, restored from the 1890s wing.", outlet: "Rooms" },
      { title: "Sunset boat service", description: "Complimentary evening crossing to the Jag Mandir pavilion.", outlet: "Other" },
      { title: "Marble Court dining", description: "Rajasthani thali and continental menus, open 7pm till late.", outlet: "Restaurant" },
    ],
    offers: [
      { title: "Third night free", description: "Book two nights midweek and the third is on us.", outlet: "Rooms" },
      { title: "20% off the royal spa", description: "Aromatherapy and Ayurvedic treatments, weekdays only.", outlet: "Spa" },
    ],
  },
  {
    name: "Marigold Residency",
    slug: "marigold-residency",
    city: "Jaipur",
    address: "C-Scheme, Ashok Marg, Jaipur, Rajasthan 302001",
    phone: "0141 405 6600",
    email: "stay@marigoldresidency.in",
    earnRatePercent: 15,
    tierCaps: { SILVER: 10, GOLD: 20, PLATINUM: 30 },
    pack: { coins: 100_000, amountPaid: 95_000, ref: "PACK-GROWTH" },
    content: [
      { title: "Courtyard rooms", description: "Twenty-eight rooms around a jacaranda courtyard.", outlet: "Rooms" },
      { title: "Rooftop breakfast", description: "Included with every stay, 7am to 10:30am.", outlet: "Restaurant" },
    ],
    offers: [
      { title: "Free airport pickup", description: "On direct bookings of two nights or more.", outlet: "Other" },
      { title: "Happy hour at The Terrace", description: "Two-for-one on cocktails, 6pm to 8pm daily.", outlet: "Bar" },
    ],
  },
  {
    name: "Cochin Backwater Retreat",
    slug: "cochin-backwater-retreat",
    city: "Kochi",
    address: "Bolgatty Island, Mulavukad, Kochi, Kerala 682504",
    phone: "0484 250 1200",
    email: "hello@cochinbackwater.in",
    earnRatePercent: 18,
    tierCaps: { SILVER: 12, GOLD: 22, PLATINUM: 32 },
    pack: { coins: 100_000, amountPaid: 95_000, ref: "PACK-GROWTH" },
    content: [
      { title: "Waterfront villas", description: "Twelve villas on the Vembanad backwaters, each with a private deck.", outlet: "Rooms" },
      { title: "Kerala kitchen", description: "Toddy-shop classics and fresh catch, cooked to order.", outlet: "Restaurant" },
    ],
    offers: [
      { title: "Sunrise houseboat cruise", description: "Complimentary for stays of three nights or longer.", outlet: "Other" },
      { title: "Ayurvedic spa package", description: "Three sessions for the price of two.", outlet: "Spa" },
    ],
  },
  {
    name: "Bandra Skyline Suites",
    slug: "bandra-skyline-suites",
    city: "Mumbai",
    address: "Linking Road, Bandra West, Mumbai, Maharashtra 400050",
    phone: "022 6789 4500",
    email: "frontdesk@bandraskyline.in",
    earnRatePercent: 15,
    tierCaps: { SILVER: 10, GOLD: 20, PLATINUM: 30 },
    // Deliberately the smallest pack: demonstrates the low-inventory filter and
    // the banner without breaking anything.
    pack: { coins: 50_000, amountPaid: 50_000, ref: "PACK-STARTER" },
    content: [
      { title: "Studio and one-bed suites", description: "Serviced apartments for longer corporate stays.", outlet: "Rooms" },
      { title: "24-hour room service", description: "Full menu through the night.", outlet: "Room Service" },
    ],
    offers: [
      { title: "Weekly rate", description: "Stay six nights, pay for five.", outlet: "Rooms" },
    ],
  },
];

/** Fixed, not random — a reproducible demo matters more than variety. */
const GUESTS = [
  { name: "Aarav Sharma", phone: "9812345601", email: "aarav.sharma@example.in" },
  { name: "Priya Iyer", phone: "9812345602", email: "priya.iyer@example.in" },
  { name: "Rohan Mehta", phone: "9812345603", email: "rohan.mehta@example.in" },
  { name: "Ananya Reddy", phone: "9812345604", email: "ananya.reddy@example.in" },
  { name: "Vikram Nair", phone: "9812345605", email: "vikram.nair@example.in" },
  { name: "Sneha Kulkarni", phone: "9812345606", email: "sneha.kulkarni@example.in" },
  { name: "Arjun Desai", phone: "9812345607", email: "arjun.desai@example.in" },
  { name: "Meera Krishnan", phone: "9812345608", email: "meera.krishnan@example.in" },
  { name: "Karthik Rao", phone: "9812345609", email: "karthik.rao@example.in" },
  { name: "Divya Menon", phone: "9812345610", email: "divya.menon@example.in" },
  { name: "Siddharth Bose", phone: "9812345611", email: null },
  { name: "Nisha Agarwal", phone: "9812345612", email: null },
];

/** Which hotels each guest belongs to, by index. Several span 2+ hotels. */
const MEMBERSHIPS = [
  [0, 3], [0], [0, 1], [1], [1, 2], [2],
  [2, 3], [3], [0, 2], [1, 3], [0], [2],
];

/** Stays to allocate: [guestIndex, hotelIndex, roomAmount, nights, daysAgo] */
const STAYS = [
  [0, 0, 18000, 2, 26], [1, 0, 12500, 1, 24], [2, 0, 22000, 3, 21],
  [2, 1, 8500, 2, 19], [3, 1, 6400, 1, 17], [4, 1, 9800, 2, 15],
  [4, 2, 14200, 3, 13], [5, 2, 11000, 2, 11], [6, 2, 7600, 1, 9],
  [6, 3, 15500, 2, 8], [7, 3, 9200, 1, 6], [8, 0, 26000, 4, 5],
  [8, 2, 13400, 2, 4], [9, 1, 7300, 1, 3], [9, 3, 11800, 2, 2],
  [10, 0, 16500, 2, 1], [11, 2, 8900, 1, 1], [0, 3, 12000, 1, 0],
];

/** Redemptions: [guestIndex, hotelIndex, coins, billAmount, outlet, daysAgo] */
const REDEMPTIONS = [
  [0, 0, 1200, 4800, "Restaurant", 20],
  [2, 0, 800, 3200, "Spa", 16],
  [4, 1, 600, 2400, "Bar", 12],
  [5, 2, 1500, 6000, "Restaurant", 8],
  [6, 3, 900, 3600, "Room Service", 4],
  [8, 0, 2000, 9000, "Restaurant", 1],
];

// ---------------------------------------------------------------- the wipe

const wipe = async () => {
  // Belt and braces: matching isProtected alone would delete the real admin if
  // the flag were ever lost; matching email alone would keep a renamed test
  // account. Both must hold.
  const keeper = await User.findOne({
    email: env.seed.adminEmail.toLowerCase(),
    isProtected: true,
  });

  if (!keeper) {
    fail(
      `Protected superadmin ${env.seed.adminEmail} not found. ` +
        `Aborting rather than wiping — run "npm run seed" first.`
    );
  }

  const [users, hotels, memberships, txs, purchases, vouchers, contents] = await Promise.all([
    User.countDocuments(),
    Hotel.countDocuments(),
    GuestHotelMembership.countDocuments(),
    CoinTransaction.countDocuments(),
    CoinPurchase.countDocuments(),
    Voucher.countDocuments(),
    Content.countDocuments(),
  ]);

  logger.warn("=".repeat(64));
  logger.warn(`ABOUT TO PERMANENTLY DELETE FROM "${dbNameFromUri(env.mongoUri)}":`);
  logger.warn(`  ${users - 1} users (keeping ${keeper.email})`);
  logger.warn(`  ${hotels} hotels, ${memberships} memberships`);
  logger.warn(`  ${txs} ledger rows, ${purchases} purchases`);
  logger.warn(`  ${vouchers} vouchers, ${contents} content items`);
  logger.warn("=".repeat(64));

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const typed = await rl.question(`Type the database name to proceed: `);
    rl.close();
    if (typed.trim() !== dbNameFromUri(env.mongoUri)) fail("Confirmation did not match. Nothing deleted.");
  }

  logger.warn("Starting in 5 seconds. Ctrl-C to abort.");
  await sleep(5000);

  await Promise.all([
    User.deleteMany({ _id: { $ne: keeper._id } }),
    Hotel.deleteMany({}),
    GuestHotelMembership.deleteMany({}),
    CoinTransaction.deleteMany({}),
    CoinPurchase.deleteMany({}),
    Voucher.deleteMany({}),
    Content.deleteMany({}),
    PendingOtp.deleteMany({}),
  ]);

  // Force a fresh login for the surviving admin.
  await User.updateOne({ _id: keeper._id }, { $set: { refreshTokens: [] } });

  // Never deleted: it holds tuned economics (welcomeCredit, platformFee,
  // tierThresholds). Upserted so a missing one is recreated with defaults.
  await PlatformSettings.updateOne({ key: "GLOBAL" }, { $setOnInsert: { key: "GLOBAL" } }, { upsert: true });

  logger.info(`Wipe complete. Kept ${keeper.email}.`);
  return keeper;
};

// ---------------------------------------------------------------- the seed

/** Backdates a ledger row + its membership activity so charts look real. */
const backdate = async (transactionId, membershipId, daysAgo) => {
  const when = new Date();
  when.setDate(when.getDate() - daysAgo);
  when.setHours(9 + (daysAgo % 10), (daysAgo * 7) % 60, 0, 0);

  // Raw driver, deliberately. Mongoose's timestamps:true rewrites createdAt
  // back to now() on any model-level update, and passing { timestamps: false }
  // returns acknowledged:false here without applying the write. Going straight
  // to the collection is the only thing that actually backdates.
  await CoinTransaction.collection.updateOne(
    { _id: transactionId },
    { $set: { createdAt: when, updatedAt: when } }
  );
  if (membershipId) {
    await GuestHotelMembership.collection.updateOne(
      { _id: membershipId },
      { $set: { lastActivityAt: when } }
    );
  }
};

const seed = async (keeper) => {
  const hotels = [];

  for (const spec of HOTELS) {
    const hotel = await hotelService.createHotel({
      name: spec.name,
      slug: spec.slug,
      city: spec.city,
      address: spec.address,
      phone: spec.phone,
      email: spec.email,
      earnRatePercent: spec.earnRatePercent,
      tierCaps: spec.tierCaps,
    });

    // .create() via the service, so the pre-save bcrypt hook runs. A
    // findOneAndUpdate here would store the password in plaintext.
    await hotelService.createHotelUser({
      hotelId: hotel._id,
      name: `${spec.name} Manager`,
      email: `manager@${spec.slug}.in`,
      password: "Demo@12345",
      role: ROLES.HOTEL_ADMIN,
    });
    await hotelService.createHotelUser({
      hotelId: hotel._id,
      name: `${spec.name} Front Desk`,
      email: `frontdesk@${spec.slug}.in`,
      password: "Demo@12345",
      role: ROLES.HOTEL_STAFF,
    });

    // MUST precede any guest: joinHotel draws the welcome credit from this
    // same inventory, and an underfunded hotel grants 0 coins.
    await coinService.recordPurchase({
      hotelId: hotel._id,
      coins: spec.pack.coins,
      amountPaid: spec.pack.amountPaid,
      paymentRef: spec.pack.ref,
      note: "Initial inventory",
      recordedBy: keeper._id,
    });

    for (const [i, c] of spec.content.entries()) {
      await contentService.createContent({
        hotelId: hotel._id,
        kind: CONTENT_KINDS.CONTENT,
        sortOrder: i,
        ...c,
      });
    }
    for (const [i, o] of spec.offers.entries()) {
      const validTo = new Date();
      validTo.setMonth(validTo.getMonth() + 3);
      await contentService.createContent({
        hotelId: hotel._id,
        kind: CONTENT_KINDS.OFFER,
        sortOrder: i,
        validFrom: new Date(),
        validTo,
        ...o,
      });
    }

    hotels.push(hotel);
    logger.info(`Hotel ready: ${hotel.name} (${spec.pack.coins.toLocaleString("en-IN")} coins)`);
  }

  // ---- guests + memberships ----
  const guests = [];
  for (const [i, g] of GUESTS.entries()) {
    const guest = await User.create({
      role: ROLES.GUEST,
      name: g.name,
      phone: g.phone,
      ...(g.email ? { email: g.email } : {}),
    });
    guests.push(guest);

    // Joins are staggered back from ~4 weeks ago so the dashboard's 7-day
    // chart and the "joined" columns show a history rather than one spike.
    const joinedDaysAgo = 28 - i * 2;
    for (const hotelIndex of MEMBERSHIPS[i]) {
      const { membership } = await joinHotel({ guestId: guest._id, hotel: hotels[hotelIndex] });

      const when = new Date();
      when.setDate(when.getDate() - joinedDaysAgo);
      await GuestHotelMembership.collection.updateOne(
        { _id: membership._id },
        { $set: { joinedAt: when, createdAt: when } }
      );
      await User.collection.updateOne({ _id: guest._id }, { $set: { createdAt: when } });

      const welcome = await CoinTransaction.findOne({
        membershipId: membership._id,
        type: "WELCOME",
      });
      if (welcome) await backdate(welcome._id, null, joinedDaysAgo);
    }
  }
  logger.info(`${guests.length} guests joined across ${hotels.length} hotels`);

  // ---- stays (EARN) ----
  for (const [gi, hi, roomAmount, nights, daysAgo] of STAYS) {
    const result = await coinService.allocateCoins({
      hotelId: hotels[hi]._id,
      phone: GUESTS[gi].phone,
      name: GUESTS[gi].name,
      roomAmount,
      nights,
      performedBy: keeper._id,
    });
    const membership = await GuestHotelMembership.findOne({
      guestId: guests[gi]._id,
      hotelId: hotels[hi]._id,
    });
    await backdate(result.transactionId, membership?._id, daysAgo);
  }
  logger.info(`${STAYS.length} stays allocated`);

  // ---- redemptions (issue a voucher, then redeem it) ----
  let redeemed = 0;
  for (const [gi, hi, coins, billAmount, outlet, daysAgo] of REDEMPTIONS) {
    try {
      const voucher = await voucherService.issueVoucher({
        guestId: guests[gi]._id,
        hotelId: hotels[hi]._id,
        coins,
      });
      const result = await voucherService.redeemVoucher({
        code: voucher.code,
        hotelId: hotels[hi]._id,
        billAmount,
        outlet: OUTLETS.includes(outlet) ? outlet : "Other",
        performedBy: keeper._id,
      });
      const membership = await GuestHotelMembership.findOne({
        guestId: guests[gi]._id,
        hotelId: hotels[hi]._id,
      });
      const row = await CoinTransaction.findOne({ voucherId: voucher._id ?? result?.voucherId });
      if (row) await backdate(row._id, membership?._id, daysAgo);
      redeemed += 1;
    } catch (error) {
      // A redemption can legitimately fail the tier cap (a SILVER member can
      // only spend 10% of the bill). Skip rather than abort the whole seed.
      logger.warn(`Redemption skipped for ${GUESTS[gi].name}: ${error.message}`);
    }
  }
  logger.info(`${redeemed}/${REDEMPTIONS.length} redemptions recorded`);

  // ---- a manual credit, so ADJUSTMENT rows exist too ----
  const firstMembership = await GuestHotelMembership.findOne({ hotelId: hotels[0]._id });
  if (firstMembership) {
    await coinService.creditMember({
      hotelId: hotels[0]._id,
      membershipId: firstMembership._id,
      coins: 2500,
      note: "Goodwill credit — delayed check-in",
      performedBy: keeper._id,
    });
  }

  return { hotels, guests };
};

// ---------------------------------------------------------------- reconcile

/** Re-runs the ledger invariant. Demo data that fails this is worthless. */
const verify = async () => {
  const rows = await CoinTransaction.aggregate([
    { $match: { membershipId: { $ne: null } } },
    { $group: { _id: "$membershipId", sum: { $sum: "$coins" } } },
  ]);
  const sums = new Map(rows.map((r) => [String(r._id), r.sum]));

  let drift = 0;
  for (const m of await GuestHotelMembership.find({})) {
    const expected = sums.get(String(m._id)) || 0;
    if (m.balance !== expected) {
      logger.error(`DRIFT ${m.memberNo}: balance ${m.balance} but ledger sums to ${expected}`);
      drift += 1;
    }
  }

  const negativeHotels = await Hotel.countDocuments({ coinInventory: { $lt: 0 } });
  if (negativeHotels) logger.error(`${negativeHotels} hotels have negative inventory`);

  if (drift || negativeHotels) fail("Seed produced inconsistent data.");
  logger.info("Reconciled — every balance matches its ledger.");
};

// ---------------------------------------------------------------- entrypoint

const run = async () => {
  guard();
  validateEnv();
  await connectDB();

  const keeper = await wipe();
  const { hotels, guests } = await seed(keeper);
  await verify();

  const [userCount, admins] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: ROLES.MAIN_ADMIN }),
  ]);

  logger.info("-".repeat(64));
  logger.info(`Done. ${hotels.length} hotels, ${guests.length} guests, ${userCount} users total.`);
  logger.info(`Superadmin accounts: ${admins} (expected 1)`);
  logger.info(`Hotel logins: manager@<slug>.in / Demo@12345`);
  logger.info("-".repeat(64));

  await mongoose.connection.close();
  process.exit(0);
};

run().catch(async (error) => {
  logger.error(`Seed failed: ${error.message}`);
  logger.error(error.stack);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
