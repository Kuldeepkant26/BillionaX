import { TIERS } from "../config/constants.js";

/**
 * Pure coin arithmetic. Every rounding decision in the platform lives here so
 * it cannot drift between the API, the panel preview, and reporting.
 *
 * Rule: always Math.floor, so rounding never invents coins or over-discounts.
 */

/** Room × Nights × Rate% — the spec's earning formula. */
export const computeEarnedCoins = ({ roomAmount, nights, ratePercent }) => {
  if (!(roomAmount > 0) || !(nights > 0) || !(ratePercent >= 0)) return 0;
  return Math.floor((roomAmount * nights * ratePercent) / 100);
};

/**
 * How many coins can actually be applied to a bill.
 * Bounded by: what the guest asked for, what they hold, and the tier cap.
 */
export const computeRedemption = ({ coinsRequested, balance, billAmount, tierCapPercent }) => {
  const capByBill = Math.floor((billAmount * tierCapPercent) / 100);
  const coinsApplied = Math.max(0, Math.min(coinsRequested, balance, capByBill));

  return {
    coinsApplied,
    capByBill,
    // 1 coin = ₹1 at the current coin value.
    discount: coinsApplied,
    cashPayable: Math.max(0, billAmount - coinsApplied),
  };
};

/** Platform commission on the cash the guest actually pays. */
export const computePlatformFee = ({ cashPayable, feePercent }) =>
  Math.floor((cashPayable * feePercent) / 100);

/** Tier from lifetime earnings. Thresholds are configurable in PlatformSettings. */
export const resolveTier = (lifetimeEarned, thresholds) => {
  if (lifetimeEarned >= thresholds[TIERS.PLATINUM]) return TIERS.PLATINUM;
  if (lifetimeEarned >= thresholds[TIERS.GOLD]) return TIERS.GOLD;
  return TIERS.SILVER;
};

/**
 * Tier from nights stayed at one hotel — the authoritative rule.
 *
 * Deliberately NOT based on coins: a guest who buys or is gifted a large
 * balance must not thereby outrank a guest who actually stayed. Thresholds are
 * per-hotel (Hotel.tierNightThresholds) so each property sets its own bar.
 */
export const resolveTierByNights = (lifetimeNights, thresholds) => {
  const nights = Number(lifetimeNights) || 0;
  const platinum = Number(thresholds?.[TIERS.PLATINUM]);
  const gold = Number(thresholds?.[TIERS.GOLD]);

  if (platinum > 0 && nights >= platinum) return TIERS.PLATINUM;
  if (gold > 0 && nights >= gold) return TIERS.GOLD;
  return TIERS.SILVER;
};

/**
 * Coins earned on a recorded stay: a percentage of the amount, set by the
 * guest's tier. The tier passed in is the one held BEFORE this stay's nights
 * are added, so an upgrade takes effect from the next stay onward.
 */
export const computeStayCoins = ({ amount, tier, tierEarnRates }) => {
  const percent = Number(tierEarnRates?.[tier]);
  if (!(amount > 0) || !(percent > 0)) return 0;
  return Math.floor((amount * percent) / 100);
};
