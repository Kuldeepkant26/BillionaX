const inr = new Intl.NumberFormat("en-IN");

export const formatCoins = (n) => inr.format(Math.round(n || 0));

export const formatCurrency = (n) => `₹${inr.format(Math.round(n || 0))}`;

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
