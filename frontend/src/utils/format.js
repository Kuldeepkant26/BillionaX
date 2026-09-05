const inr = new Intl.NumberFormat("en-IN");

export const formatCoins = (n) => inr.format(Math.round(n || 0));

export const formatCurrency = (n) => `₹${inr.format(Math.round(n || 0))}`;

/**
 * Money that arrived in paise — bills and payments.
 *
 * Separate from formatCurrency, which takes rupees, because the two units
 * coexist: the coin ledger is rupees and the bill/payment path is paise.
 * Passing one to the other is a 100x error, so each has its own function and
 * every call site has to say which it means.
 *
 * Whole rupees are printed without decimals, since most bills are round and
 * "₹5,900.00" is noisier than "₹5,900".
 */
export const formatPaise = (paise) => {
  const value = Math.round(Number(paise) || 0);
  const rupees = value / 100;
  return value % 100 === 0
    ? `₹${inr.format(rupees)}`
    : `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** "5900" (rupees, as typed by staff) -> 590000 paise. */
export const rupeesToPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);

/** Compact Indian notation (lakh/crore) for dashboard tiles. */
export const formatCompact = (n) => {
  const v = Math.round(n || 0);
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
  if (v >= 100_000) return `₹${(v / 100_000).toFixed(2)}L`;
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${inr.format(v)}`;
};

export const formatCoinsCompact = (n) => {
  const v = Math.round(n || 0);
  if (v >= 100_000) return `${(v / 100_000).toFixed(1)}L`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return inr.format(v);
};

export const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

/**
 * "Ends today" / "Ends in 3 days" / "Until 14 Mar" — an offer's deadline.
 *
 * Day granularity on purpose. useCountdown ticks every second, which is right
 * for a ten-minute voucher and wrong for a deadline a fortnight out: it would
 * re-render the whole offers list once a second for weeks. This is a pure
 * function with no timer, recomputed on whatever render the list already does.
 */
export const endsIn = (value) => {
  if (!value) return "";
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Ended";

  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return "Ends within the hour";
  if (hours < 24) return "Ends today";

  const days = Math.round(hours / 24);
  if (days === 1) return "Ends tomorrow";
  if (days <= 7) return `Ends in ${days} days`;

  return `Until ${formatDate(value)}`;
};

/**
 * "just now" / "4h ago" / "12 Mar" — the timestamp style a comment thread
 * wants, where the exact minute matters far less than the recency.
 */
export const timeAgo = (value) => {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  // Past a week a real date is more useful than "37d ago".
  return formatDate(value);
};

/**
 * "Good morning" / "Good afternoon" / "Good evening" for the current hour.
 *
 * Takes an optional Date so it can be tested at a fixed hour rather than only
 * at whatever time the suite happens to run.
 *
 * Boundaries are the conventional ones: morning until noon, afternoon until
 * 5pm, evening after. Uses the DEVICE clock, which is the one the guest is
 * living in — a server-side hour would greet a traveller by the wrong one.
 */
export const greeting = (now = new Date()) => {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export const maskPhone = (phone) => {
  if (!phone) return "—";
  const s = String(phone);
  return s.length <= 4 ? s : `${s.slice(0, 2)}••••${s.slice(-3)}`;
};

export const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

/** Indian mobile: 10 digits starting 6-9. Mirrors the API's rule exactly. */
export const isValidPhone = (value) => /^[6-9]\d{9}$/.test(String(value || ""));

/** Reduces any input to the bare 10 digits, matching the API's normalisation. */
export const normalizePhone = (value) => String(value || "").replace(/\D/g, "").slice(-10);

export const mmss = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Defaults matching the Hotel model, so a preview works before settings load. */
export const DEFAULT_NIGHT_THRESHOLDS = { GOLD: 30, PLATINUM: 75 };
export const DEFAULT_TIER_EARN_RATES = { SILVER: 15, GOLD: 20, PLATINUM: 30 };

/**
 * Tier from nights stayed. Mirrors the API's resolveTierByNights exactly — the
 * panel previews "this stay makes them Gold" before the request is sent, and a
 * drifting copy here would promise an upgrade the server then refuses.
 */
export const resolveTierByNights = (nights, thresholds = DEFAULT_NIGHT_THRESHOLDS) => {
  const n = Number(nights) || 0;
  const platinum = Number(thresholds?.PLATINUM);
  const gold = Number(thresholds?.GOLD);

  if (platinum > 0 && n >= platinum) return "PLATINUM";
  if (gold > 0 && n >= gold) return "GOLD";
  return "SILVER";
};
