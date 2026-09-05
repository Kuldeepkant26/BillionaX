/**
 * The colour themes the main admin can choose between, applied network-wide
 * to the admin panel, the hotel panels and the guest app.
 *
 * This registry is the lockstep partner of THEME_PRESETS in the backend's
 * constants.js — backend/tests/themePreset.test.js parses this file's keys
 * and asserts both lists match in both directions. The actual palettes live
 * in styles/themes.css as `[data-accent="KEY"]` blocks; the swatches here
 * exist only so the settings picker can preview every preset at once.
 *
 * `category` groups the presets into the sections the picker renders. It is a
 * PRESENTATION field only — nothing downstream stores or validates it, so
 * moving a preset between sections is a safe, cosmetic change. Every preset
 * must name a category that exists in THEME_CATEGORIES below, or the picker
 * would silently drop it; ACCENT_CATEGORY_GROUPS is built from the category
 * order and asserts nothing is orphaned.
 *
 * `chart2` is each preset's SECOND categorical series colour. It is declared
 * per preset rather than shared, because one fixed companion hue cannot stay
 * distinguishable from every accent — a slate that separates cleanly from
 * coral collapses against blue. Every accent/chart2 pair here was checked
 * with the dataviz validator for colourblind separation, normal-vision
 * separation and contrast against the card surface.
 *
 * A stored key this registry does not know resolves to the default, so
 * removing a preset can never leave a dashboard unpainted.
 */

/**
 * The picker's sections, in display order.
 *
 * These describe the FEEL of a palette, not its hue: "Soft" is about low
 * saturation and gentle contrast, and holds both a warm blush and a cool
 * sage. Grouping by hue instead would just reproduce the flat colour list
 * the sections exist to break up.
 */
export const THEME_CATEGORIES = [
  {
    key: "SOFT",
    label: "Soft",
    note: "Low-saturation palettes with gentle contrast — calm, easy on long sessions.",
  },
  {
    key: "PREMIUM",
    label: "Premium",
    note: "Deep, jewelled colours on near-black rails — the luxury end of the range.",
  },
  {
    key: "LIGHT",
    label: "Light & airy",
    note: "Pale rails and bright grounds. The most open, least heavy option.",
  },
  {
    key: "VIVID",
    label: "Vivid",
    note: "Saturated, high-energy accents that carry from across a room.",
  },
  {
    key: "CLASSIC",
    label: "Classic",
    note: "Restrained business palettes — navy, slate and monochrome.",
  },
];

export const THEME_CATEGORY_KEYS = THEME_CATEGORIES.map((c) => c.key);

export const ACCENT_PRESETS = {
  /* ----------------------------- Soft ------------------------------- */
  SAND: {
    label: "Desert Sand",
    note: "Soft terracotta on warm stone — understated luxury",
    category: "SOFT",
    swatches: { rail: "#2b2622", acc: "#b5673f", soft: "#f7ebe3" },
  },
  LAVENDER: {
    label: "Soft Lavender",
    note: "Muted violet on a pale ground — gentle and modern",
    category: "SOFT",
    swatches: { rail: "#3a3457", acc: "#7a5cb8", soft: "#f0ecfa" },
  },
  TEAL: {
    label: "Muted Teal",
    note: "Soft blue-green — clean and restful",
    category: "SOFT",
    swatches: { rail: "#1d4d55", acc: "#3f7d8c", soft: "#e2f0f2" },
  },
  ROSE: {
    label: "Dusty Rose",
    note: "Warm mauve — refined without being loud",
    category: "SOFT",
    swatches: { rail: "#3d2630", acc: "#9a5b7d", soft: "#f8eaf1" },
  },
  SAGE: {
    label: "Sage",
    note: "Greyed garden green — the quietest palette on the list",
    category: "SOFT",
    swatches: { rail: "#333d33", acc: "#5f7a55", soft: "#eaf0e6" },
  },
  CLAY: {
    label: "Warm Clay",
    note: "Dusty brick on oatmeal — soft warmth without the orange",
    category: "SOFT",
    swatches: { rail: "#3a2e2a", acc: "#a35f4e", soft: "#f7ece7" },
  },

  /* ---------------------------- Premium ----------------------------- */
  CHAMPAGNE: {
    label: "Champagne Gold",
    note: "The brand gold on a near-black rail",
    category: "PREMIUM",
    swatches: { rail: "#171310", acc: "#8a6f28", soft: "#f3ecd9" },
  },
  EMERALD: {
    label: "Emerald",
    note: "Deep green, grounded and fresh",
    category: "PREMIUM",
    swatches: { rail: "#10603f", acc: "#177a53", soft: "#dff2e9" },
  },
  OBSIDIAN: {
    label: "Obsidian Gold",
    note: "Black rail, antique brass accent — the most formal option",
    category: "PREMIUM",
    swatches: { rail: "#0d0c0a", acc: "#7d6534", soft: "#f2eddf" },
  },
  BURGUNDY: {
    label: "Burgundy",
    note: "Deep wine on oxblood — cellar-door richness",
    category: "PREMIUM",
    swatches: { rail: "#2e1319", acc: "#8f2740", soft: "#f8e7ea" },
  },
  ONYX_JADE: {
    label: "Onyx Jade",
    note: "Near-black rail with a cool jade accent — jewelled and restrained",
    category: "PREMIUM",
    swatches: { rail: "#101614", acc: "#2f7d6a", soft: "#e2f1ed" },
  },
  PLUM: {
    label: "Royal Plum",
    note: "Saturated purple on aubergine — theatrical, still serious",
    category: "PREMIUM",
    swatches: { rail: "#261a33", acc: "#6b3fa0", soft: "#f0e9f8" },
  },

  /* ----------------------------- Light ------------------------------ */
  LINEN: {
    label: "Linen",
    note: "Pale sand rail with espresso ink — bright and paper-like",
    category: "LIGHT",
    swatches: { rail: "#efe7da", acc: "#8a6a45", soft: "#f8f2e9" },
  },
  MIST: {
    label: "Mist",
    note: "Pale blue-grey rail — the airiest palette, almost weightless",
    category: "LIGHT",
    swatches: { rail: "#e4ebf1", acc: "#41708f", soft: "#eaf2f7" },
  },
  BLUSH: {
    label: "Blush",
    note: "Soft pink rail with a deep rose accent — warm and open",
    category: "LIGHT",
    swatches: { rail: "#f5e6e6", acc: "#a8546a", soft: "#fbecef" },
  },
  MEADOW: {
    label: "Meadow",
    note: "Pale green rail, fresh mid-green accent — light and natural",
    category: "LIGHT",
    swatches: { rail: "#e4eee2", acc: "#3f7d4f", soft: "#e9f4e8" },
  },

  /* ----------------------------- Vivid ------------------------------ */
  CORAL: {
    label: "Vivid Coral",
    note: "Warm and energetic — the house default",
    category: "VIVID",
    swatches: { rail: "#d8411f", acc: "#d8411f", soft: "#fbe7df" },
  },
  INDIGO: {
    label: "Indigo Night",
    note: "Cool violet-blue, calm and focused",
    category: "VIVID",
    swatches: { rail: "#4d40c9", acc: "#5f51e3", soft: "#ebe8fc" },
  },
  SAFFRON: {
    label: "Saffron",
    note: "Hot marigold on a spiced rail — the warmest, loudest option",
    category: "VIVID",
    swatches: { rail: "#a8580c", acc: "#b4610d", soft: "#fdeeda" },
  },
  FUCHSIA: {
    label: "Fuchsia",
    note: "Electric magenta — unmistakable and modern",
    category: "VIVID",
    swatches: { rail: "#a81b6d", acc: "#b8237a", soft: "#fce6f2" },
  },
  VIRIDIAN: {
    label: "Viridian",
    note: "Bright tropical green — high energy without the warmth",
    category: "VIVID",
    swatches: { rail: "#04785c", acc: "#068366", soft: "#daf4ec" },
  },

  /* ---------------------------- Classic ----------------------------- */
  OCEAN: {
    label: "Ocean",
    note: "Steady maritime blue",
    category: "CLASSIC",
    swatches: { rail: "#10598c", acc: "#176ba8", soft: "#e0eef8" },
  },
  MIDNIGHT: {
    label: "Midnight Slate",
    note: "Deep navy rail with a bright azure accent",
    category: "CLASSIC",
    swatches: { rail: "#111a2e", acc: "#2f6fd0", soft: "#e6eefb" },
  },
  MONO: {
    label: "Graphite",
    note: "Monochrome ink — maximum restraint",
    category: "CLASSIC",
    swatches: { rail: "#0f1216", acc: "#101318", soft: "#eef1f4" },
  },
  SLATE: {
    label: "Slate Blue",
    note: "Muted steel blue on a cool grey rail — quiet corporate",
    category: "CLASSIC",
    swatches: { rail: "#2a323d", acc: "#4a6485", soft: "#e9edf3" },
  },
  FOREST: {
    label: "Forest",
    note: "Dark pine rail with a mid-green accent — traditional and solid",
    category: "CLASSIC",
    swatches: { rail: "#1b2f24", acc: "#356b48", soft: "#e4efe7" },
  },
  CUSTOM: {
    label: "Custom",
    note: "Pick any colour from the wheel",
    category: "CLASSIC",
    // Overwritten at render time by the admin's own colour; these are just
    // the resting swatches shown before one is chosen.
    swatches: { rail: "#2b3140", acc: "#5b6474", soft: "#eef1f4" },
    isCustom: true,
  },
};

export const ACCENT_PRESET_KEYS = Object.keys(ACCENT_PRESETS);

/**
 * The presets bucketed into the picker's sections, in category order.
 *
 * Built from the registry rather than hand-listed, so adding a preset above is
 * the only edit needed to make it appear. A preset whose `category` names no
 * known section would vanish from the picker entirely, so those fall into the
 * LAST section instead — a misfiled tile is a cosmetic bug, a missing one is
 * a theme nobody can select.
 */
export const ACCENT_CATEGORY_GROUPS = (() => {
  const fallback = THEME_CATEGORY_KEYS[THEME_CATEGORY_KEYS.length - 1];
  const buckets = Object.fromEntries(THEME_CATEGORY_KEYS.map((key) => [key, []]));

  for (const key of ACCENT_PRESET_KEYS) {
    const category = ACCENT_PRESETS[key].category;
    buckets[buckets[category] ? category : fallback].push(key);
  }

  return THEME_CATEGORIES.map((category) => ({
    ...category,
    keys: buckets[category.key],
  })).filter((group) => group.keys.length > 0);
})();

export const DEFAULT_ACCENT = "CORAL";

/** The custom preset stores its hue separately — see themeSlice.accentCustom. */
export const CUSTOM_ACCENT = "CUSTOM";

export const DEFAULT_CUSTOM_COLOR = "#5b6474";

/** Unknown keys fall back to the default rather than rendering unstyled. */
export const resolveAccent = (key) => (ACCENT_PRESETS[key] ? key : DEFAULT_ACCENT);

/** #rgb / #rrggbb only — this value ends up inside a CSS custom property. */
export const isValidHex = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(value || ""));

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** #rgb or #rrggbb → {r,g,b} 0-255. Assumes isValidHex has passed. */
export const hexToRgb = (hex) => {
  let h = String(hex).replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const int = parseInt(h, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
};

export const rgbToHex = ({ r, g, b }) =>
  "#" +
  [r, g, b]
    .map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0"))
    .join("");

export const hslToHex = (h, s, l) => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return (l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))) * 255;
  };
  return rgbToHex({ r: f(0), g: f(8), b: f(4) });
};

export const hexToHsl = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h = h * 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
};

/** Relative luminance (WCAG) — decides whether text on the colour is light or dark. */
export const luminance = (hex) => {
  const { r, g, b } = hexToRgb(hex);
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
};

/**
 * Every token the custom accent needs, derived from one hue.
 *
 * The admin picks a single colour; a usable theme needs a readable foreground,
 * a darker companion, a tint and a rail. Deriving them in HSL keeps the whole
 * set in one family and — critically — keeps the foreground legible whatever
 * colour is chosen, which a raw hex alone cannot guarantee.
 */
export const deriveCustomTokens = (hex) => {
  const safe = isValidHex(hex) ? hex : DEFAULT_CUSTOM_COLOR;
  const { h, s, l } = hexToHsl(safe);

  // Keep the accent itself in a band that can hold white or near-black text
  // and still read as a colour rather than a grey.
  const accL = clamp(l, 32, 58);
  const accS = clamp(s, 12, 92);
  const acc = hslToHex(h, accS, accL);

  return {
    acc,
    accFg: luminance(acc) > 0.42 ? "#101318" : "#ffffff",
    acc2: hslToHex(h, accS, clamp(accL - 12, 18, 50)),
    accSoft: hslToHex(h, clamp(accS * 0.55, 10, 60), 94),
    rail: hslToHex(h, clamp(accS * 0.9, 14, 88), clamp(accL - 8, 22, 46)),
    hero: `linear-gradient(145deg, ${hslToHex(h, accS, clamp(accL + 16, 40, 74))}, ${acc} 60%, ${hslToHex(
      h,
      accS,
      clamp(accL - 14, 16, 46)
    )})`,
    // Second chart series: a fixed 150° hue rotation, which keeps it clearly
    // separate from the accent for any starting hue.
    chart2: hslToHex((h + 150) % 360, clamp(accS * 0.7, 22, 62), 42),
  };
};
