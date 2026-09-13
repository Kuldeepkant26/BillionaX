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

/** Platform commission on the cash the guest actually pays. In RUPEES. */
export const computePlatformFee = ({ cashPayable, feePercent }) =>
  Math.floor((cashPayable * feePercent) / 100);

/* ------------------------------------------------------------------ bills --
 *
 * Everything below is in PAISE, because that is what a payment gateway speaks
 * and converting at every call is where rounding bugs breed. Everything above
 * is in RUPEES, because that is what the coin ledger has always stored
 * (1 coin = ₹1, CoinTransaction.billAmount is a rupee figure, and the month-end
 * rebate reads it as one).
 *
 * The two units meet in exactly one place — bill.service.js, when it writes the
 * REDEEM ledger row — and every field here says which unit it is in. Mixing
 * them is a 100x error that no test of a single function would catch, so the
 * naming is the guard rail.
 */

/** ₹45.50 -> 4550 paise. Round, not floor: this is a conversion, not a share. */
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);

/**
 * 4550 paise -> ₹45.
 *
 * Floors, because the result feeds the rupee-denominated coin ledger and
 * rounding up there would credit a rebate on money nobody paid.
 */
export const toRupees = (paise) => Math.floor(Number(paise) / 100);

/**
 * Line items and a tax rate to a bill total, all paise.
 *
 * Tax is computed on the subtotal rather than per line, so the figure matches
 * what a guest gets if they add the lines up themselves and apply the rate
 * once. Per-line tax would round several times and land a rupee or two off.
 */
export const computeBillTotals = ({ lineItems = [], taxPercent = 0 }) => {
  const subtotalPaise = lineItems.reduce((sum, item) => {
    const qty = Math.max(0, Math.trunc(Number(item?.qty) || 0));
    const unit = Math.max(0, Math.trunc(Number(item?.unitPricePaise) || 0));
    return sum + qty * unit;
  }, 0);

  const percent = Math.max(0, Number(taxPercent) || 0);
  const taxPaise = Math.floor((subtotalPaise * percent) / 100);

  return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
};

/**
 * Splits what the guest pays between the platform and the hotel.
 *
 * Taken POST-discount: coins come off the bill first, and the commission is a
 * share of the cash that actually moves. The hotel funds the coin discount,
 * which matches the existing model where the hotel's own inventory backs the
 * coins it issued.
 *
 * hotelAmountPaise is derived by SUBTRACTION, never by a second percentage.
 * floor(x*0.05) + floor(x*0.95) is a paisa short of x for most x, and a
 * transfer set that does not sum to the captured amount is rejected outright.
 * Subtracting makes the two halves add up by construction, with any odd paisa
 * falling to the hotel.
 */
export const computeBillSplit = ({ payablePaise, feePercent }) => {
  const payable = Math.max(0, Math.trunc(Number(payablePaise) || 0));
  const percent = Math.min(100, Math.max(0, Number(feePercent) || 0));

  const platformCommissionPaise = Math.floor((payable * percent) / 100);

  return {
    platformCommissionPaise,
    hotelAmountPaise: payable - platformCommissionPaise,
  };
};

/**
 * The coin allowance for a set of priced lines, in paise.
 *
 * Each line's allowance is a share of its OWN pre-tax amount, set by the
 * service it was charged to, and the summed base is then grossed up by the tax
 * rate once. That mirrors computeBillTotals exactly, and for the reason its
 * comment gives: tax belongs to the bill, not the line, and applying it per
 * line rounds N times and lands a rupee or two off what a guest gets adding it
 * up themselves.
 *
 * Grossing up rather than stopping at the pre-tax figure is what lets a 100%
 * service actually settle a bill in full — otherwise the tax would always be
 * unreachable. Clamped to totalPaise regardless, so no combination of rates can
 * authorise more than the bill is worth.
 *
 * `capPercentFor(line)` returns that line's own percent, or null when it has no
 * service tagged — in which case it falls back to tierCapPercent, which is both
 * the pre-services behaviour and what a hotel with no service records still
 * gets.
 *
 * FLOOR DISCIPLINE: once per line, then once on the gross-up. Never rounds up,
 * so the allowance can only ever be under the true share — the rule at the top
 * of this file.
 */
export const computeCoinAllowance = ({
  lineItems = [],
  taxPercent = 0,
  totalPaise = 0,
  tierCapPercent = 0,
  capPercentFor = () => null,
}) => {
  const fallback = Math.min(100, Math.max(0, Number(tierCapPercent) || 0));

  const perLineAllowancePaise = lineItems.map((line) => {
    const amount = Math.max(0, Math.trunc(Number(line?.amountPaise) || 0));

    // `?? fallback`, NEVER `|| fallback`: 0 is a hotel saying "no coins at the
    // spa" and must survive. `||` would quietly promote it to the tier cap,
    // which is the exact bug per-service caps exist to prevent.
    const raw = capPercentFor(line);
    const percent = Math.min(100, Math.max(0, Number(raw ?? fallback) || 0));

    return Math.floor((amount * percent) / 100);
  });

  const baseAllowancePaise = perLineAllowancePaise.reduce((sum, n) => sum + n, 0);

  const rate = Math.max(0, Number(taxPercent) || 0);
  const grossed = baseAllowancePaise + Math.floor((baseAllowancePaise * rate) / 100);

  return {
    // Belt and braces against the clamp in computeBillCoins: an allowance above
    // the total would drive payablePaise negative.
    allowancePaise: Math.min(grossed, Math.max(0, Math.trunc(Number(totalPaise) || 0))),
    // PRE-TAX, and frozen per line as such. Note the sum of these does NOT
    // equal allowancePaise whenever tax > 0 or the clamp bites — they are the
    // audit trail, allowancePaise is the authority.
    perLineAllowancePaise,
    baseAllowancePaise,
  };
};

/**
 * How many coins the guest may put against a bill, and what is left to pay.
 *
 * The paise-denominated sibling of computeRedemption. Coins stay a rupee count
 * because that is what a coin is; only the money is paise.
 *
 * TWO SHAPES, ONE ANSWER. A bill raised since per-service caps carries
 * `coinAllowancePaise` — an absolute figure resolved from each line's service
 * and frozen at creation. A bill raised before carries only `tierCapPercent`.
 * Both must keep working forever: bills are financial history, and no migration
 * could invent per-line services for a bill nobody itemised that way.
 *
 * The `== null` check is explicit, never a falsy test. An allowance of 0 is the
 * whole point of a 0% service, and `coinAllowancePaise || derive()` would hand
 * a spa-only bill the guest's full tier cap.
 */
export const computeBillCoins = ({
  coinsRequested,
  balance,
  totalPaise,
  tierCapPercent,
  coinAllowancePaise = null,
}) => {
  const capPaise =
    coinAllowancePaise == null
      ? Math.floor((totalPaise * Math.max(0, Number(tierCapPercent) || 0)) / 100)
      : Math.max(0, Math.min(Math.trunc(Number(coinAllowancePaise)), totalPaise));

  // A coin is worth ₹1, so the cap in coins is the cap in whole rupees.
  const capCoins = toRupees(capPaise);

  const coinsApplied = Math.max(
    0,
    Math.min(Math.trunc(Number(coinsRequested) || 0), Math.trunc(Number(balance) || 0), capCoins)
  );

  const coinsDiscountPaise = toPaise(coinsApplied);

  return {
    coinsApplied,
    capCoins,
    capPaise,
    coinsDiscountPaise,
    payablePaise: Math.max(0, totalPaise - coinsDiscountPaise),
  };
};

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
