/**
 * The arithmetic behind the coin distribution tab and its animation.
 *
 * Plain JS with no imports, so node:test can pin it without a bundler. The
 * one rule that matters for money is computeRebate, which MUST stay identical
 * to the backend's (rebate.service.js): the tab previews payouts with it, and
 * a copy that rounded where the server floors would promise a hotel a coin the
 * server then refuses to pay.
 */

/** Floored, never rounded — the platform never pays more than the agreed share. */
export const computeRebate = (coinsRedeemed, ratePercent) =>
  Math.floor(((Number(coinsRedeemed) || 0) * (Number(ratePercent) || 0)) / 100);

/**
 * Splits `total` whole coins into `parts` integer shares that add up EXACTLY.
 *
 * Each flying coin in the animation carries one share, and the hotel's counter
 * is the sum of the coins that have landed — so if these did not add up, the
 * counter would stop one short of the figure printed beside it.
 */
export const splitCoins = (total, parts) => {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const n = Math.max(1, Math.floor(Number(parts) || 1));
  const base = Math.floor(t / n);
  const extra = t - base * n;
  // The remainder goes to the LAST coins, so the counter finishes on a small
  // visible jump to the exact figure rather than starting with one.
  return Array.from({ length: n }, (_, i) => base + (i >= n - extra ? 1 : 0));
};

/**
 * How many coins fly to each hotel.
 *
 * Square-root of the share rather than linear: with linear, one big hotel gets
 * a torrent and a small one a single lonely coin. The floor keeps every hotel
 * visibly paid; the cap and the overall budget keep a 60-hotel network from
 * drowning the canvas.
 */
export const particlePlan = (amounts, { min = 5, max = 34, budget = 420 } = {}) => {
  const list = amounts.map((a) => Math.max(0, Number(a) || 0));
  if (!list.length) return [];

  const top = Math.max(...list, 1);
  const raw = list.map((a) => (a > 0 ? Math.round(min + (max - min) * Math.sqrt(a / top)) : 0));
  const sum = raw.reduce((s, n) => s + n, 0);

  if (sum <= budget) return raw;
  const scale = budget / sum;
  return raw.map((n) => (n > 0 ? Math.max(2, Math.floor(n * scale)) : 0));
};

/** "2026-09" -> "September 2026", the same names the server uses. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const periodLabel = (period) => {
  const [y, m] = String(period || "").split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : String(period || "");
};

/**
 * The months the picker offers, newest first, starting from the server's
 * "last month" — never the browser's, which could be a day out near midnight
 * in another timezone.
 */
export const periodOptions = (latest, count = 12) => {
  const [y, m] = String(latest || "").split("-").map(Number);
  if (!y || !m) return [];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
};

/**
 * The hotels the animation pays, biggest first, in the shape it draws.
 *
 * `source: "credited"` reads what each hotel was ACTUALLY paid (a completed
 * month, or the figures fetched back after a live run). `"projected"` reads
 * what each would get at `ratePercent` — the forecast a test run shows. A
 * settled hotel always shows its settlement, even in a projection, because
 * its payout is no longer a forecast.
 */
export const showRows = (overview, { source = "projected", ratePercent } = {}) => {
  const rate = ratePercent ?? overview?.ratePercent ?? 0;

  return (overview?.rows || [])
    .map((r) => {
      const credited = r.settlement?.coinsCredited;
      const coins =
        source === "credited" ? credited || 0 : credited ?? computeRebate(r.coinsRedeemed, rate);
      return {
        hotelId: r.hotelId,
        name: r.name,
        city: r.city,
        logoUrl: r.logoUrl,
        coins,
        redeemed: r.coinsRedeemed,
        coinInventory: r.coinInventory || 0,
      };
    })
    .filter((r) => r.coins > 0)
    .sort((a, b) => b.coins - a.coins);
};

/**
 * Stand-in hotels for test mode when the chosen month has no redemptions —
 * the usual state of a staging network on the day the client is shown the
 * feature. Fixed figures (no Math.random) so the demo tells the same story
 * every time it is played.
 */
const SAMPLE = [
  ["The Grand Meridian", "Mumbai", 48_600],
  ["Lakeview Retreat", "Udaipur", 36_200],
  ["Azure Bay Resort", "Goa", 29_850],
  ["Himalayan Crest", "Manali", 21_400],
  ["Heritage Haveli", "Jaipur", 17_900],
  ["Backwater Palms", "Kochi", 12_350],
  ["Cedar Court", "Shimla", 8_640],
  ["Harbour Lights", "Chennai", 5_120],
];

export const sampleRows = (ratePercent = 50) =>
  SAMPLE.map(([name, city, redeemed], i) => ({
    hotelId: `sample-${i}`,
    name,
    city,
    logoUrl: null,
    redeemed,
    coins: computeRebate(redeemed, ratePercent),
    coinInventory: 40_000 + i * 7_500,
  })).filter((r) => r.coins > 0);

/** Ease functions for the canvas, kept here so they are testable too. */
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Point on a quadratic Bézier — the arc each coin flies along. */
export const bezier = (a, c, b, t) => {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
};

/** "2026-09" moved by `delta` months: shiftPeriod("2026-12", 1) -> "2027-01". */
export const shiftPeriod = (period, delta) => {
  const [y, m] = String(period || "").split("-").map(Number);
  if (!y || !m) return period;
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
