import mongoose from "mongoose";

export const REBATE_RUN_STATUS = Object.freeze({
  RUNNING: "RUNNING",
  COMPLETE: "COMPLETE",
});

/**
 * One month's coin distribution, as a whole.
 *
 * RebateSettlement records each HOTEL being paid for a month; this records the
 * MONTH being distributed. The two are different guarantees:
 *
 *   - RebateSettlement's {hotelId, period} index stops a hotel being paid twice.
 *   - This model's unique `period` stops the month being distributed twice at
 *     all — the admin panel's "only once, then show Distribution complete".
 *
 * A run is claimed (inserted as RUNNING) before any coins move and flipped to
 * COMPLETE after the last hotel. If the process dies in between, the row stays
 * RUNNING; once it is older than STALE_RUN_MS a later attempt may take it over
 * and finish the job, which is safe because every hotel already paid is
 * skipped by RebateSettlement's own index.
 *
 * The totals are copied in at completion from the settlements themselves, so
 * this row is a summary of what actually happened, never a forecast.
 */
const rebateRunSchema = new mongoose.Schema(
  {
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },

    status: {
      type: String,
      enum: Object.values(REBATE_RUN_STATUS),
      default: REBATE_RUN_STATUS.RUNNING,
    },

    // The rate the run was started at. Frozen for the same reason the
    // settlement freezes it: changing the setting later must not rewrite what
    // this month meant.
    ratePercent: { type: Number, required: true, min: 0, max: 100 },

    hotelsCredited: { type: Number, default: 0 },
    coinsRedeemed: { type: Number, default: 0 },
    coinsCredited: { type: Number, default: 0 },

    startedAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },

    // Null when the scheduled script ran it rather than an admin.
    runBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

rebateRunSchema.index({ period: 1 }, { unique: true });

export const RebateRun = mongoose.model("RebateRun", rebateRunSchema);
