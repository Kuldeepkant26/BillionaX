/**
 * Backdates an offer's deadline, so the expiry sweep can be tested without
 * waiting a week for a real grace period to elapse.
 *
 *   node scripts/ageOffer.js <offerId> --days 8
 *
 * Days defaults to OFFER_GRACE_DAYS + 1, i.e. just past due.
 */
import mongoose from "mongoose";
import { config } from "dotenv";
import { Content } from "../src/models/content.model.js";
import { CONTENT_KINDS, OFFER_GRACE_DAYS } from "../src/config/constants.js";

config();

const [id] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const daysFlag = process.argv.indexOf("--days");
const days = daysFlag > -1 ? Number(process.argv[daysFlag + 1]) : OFFER_GRACE_DAYS + 1;

const run = async () => {
  if (!id || !mongoose.isValidObjectId(id)) {
    console.error("Usage: node scripts/ageOffer.js <offerId> [--days 8]");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const validTo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const offer = await Content.findOneAndUpdate(
    { _id: id, kind: CONTENT_KINDS.OFFER },
    { validTo },
    { new: true }
  );

  if (!offer) console.error("No offer with that id.");
  else console.log(`"${offer.title}" now ends ${validTo.toISOString()} (${days} days ago).`);

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
