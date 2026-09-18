import mongoose from "mongoose";

/**
 * Atomic named sequences. Currently one user: invoice numbering.
 *
 * WHY NOT count() + 1. Two guests paying in the same tick would both read the
 * same count and both be handed the same invoice number — and an invoice
 * number is a legal identifier that must be unique. `$inc` inside a single
 * findOneAndUpdate is atomic at the document level in MongoDB, so the increment
 * and the read are one operation and concurrent callers are serialised by the
 * server rather than by hope.
 *
 * WHY NOT A TIMESTAMP OR A RANDOM SUFFIX. Invoice series are expected to be
 * sequential and gapless by the people who file them; "BLX-2026-000412" tells
 * an accountant there are 411 invoices before it, and a random id does not.
 *
 * GAPS ARE STILL POSSIBLE, and that is accepted: a number is consumed before
 * the invoice document is written, so a crash in between burns one. A gap is a
 * far smaller problem than a duplicate, and the alternative — reserving under
 * a transaction — would put the numbering on the payment's critical path.
 */
const counterSchema = new mongoose.Schema(
  {
    // e.g. "invoice:2026" — the year is part of the key, so each year's series
    // restarts at 1 without a sweep.
    key: { type: String, required: true, unique: true },
    value: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Counter = mongoose.model("Counter", counterSchema);

/**
 * The next value in a named sequence. Never returns the same number twice.
 *
 * `upsert` creates the counter on first use, so no seeding step is needed and
 * a fresh deployment issues BLX-2026-000001 with no setup.
 */
export const nextSequence = async (key) => {
  const doc = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.value;
};
