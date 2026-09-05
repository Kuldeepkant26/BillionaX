/**
 * The typeface pairings the main admin can choose between, applied
 * network-wide to the admin panel, the hotel panels and the guest app.
 *
 * This registry is the lockstep partner of FONT_PRESETS in the backend's
 * constants.js — backend/tests/fontPreset.test.js parses this file's keys and
 * asserts both lists match in both directions, exactly as the theme and card
 * registries do.
 *
 * Each preset names TWO faces because the app uses two: --font-display for
 * headings and figures, --font-ui for body and controls. Choosing them as a
 * PAIR rather than two independent dropdowns is deliberate — a display serif
 * and a UI sans have to be picked against each other, and letting an admin
 * combine any two would mostly produce combinations nobody signed off.
 *
 * WHAT THIS DOES NOT CHANGE: --font-mono. The membership-card numerals and the
 * member id are fixed-width on purpose (they are read aloud at a front desk),
 * and every card design positions them against a monospace advance width. A
 * proportional face there would reflow the card art, so the mono stack is not
 * part of this setting.
 *
 * `stacks` is the actual CSS the app applies; it is applied by attribute via
 * styles/fonts.css, so nothing here is ever interpolated from stored data —
 * the API stores a key, the same as themePreset. `families` lists only the
 * webfonts that need loading (see FONT_PRESET_FAMILIES below).
 *
 * A stored key this registry does not know resolves to the default, so
 * removing a preset can never leave the app unstyled.
 */

/**
 * Every preset falls back through the same system stack, so a webfont that
 * fails to load degrades to something with the right proportions rather than
 * to Times.
 */
const SANS_FALLBACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const SERIF_FALLBACK = 'Georgia, "Times New Roman", serif';

export const FONT_PRESETS = {
  EDITORIAL: {
    label: "Editorial",
    note: "Fraunces headlines over a clean grotesk — the house default.",
    // Named so the picker can say what changes without the admin guessing.
    display: "Fraunces",
    ui: "Schibsted Grotesk",
    families: ["Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700", "Schibsted+Grotesk:wght@400;500;600;700"],
    stacks: {
      display: `"Fraunces", ${SERIF_FALLBACK}`,
      ui: `"Schibsted Grotesk", ${SANS_FALLBACK}`,
    },
  },

  MODERN: {
    label: "Modern",
    note: "One geometric sans throughout. The most neutral, screen-first option.",
    display: "Inter",
    ui: "Inter",
    families: ["Inter:wght@400;500;600;700;800"],
    stacks: {
      display: `"Inter", ${SANS_FALLBACK}`,
      ui: `"Inter", ${SANS_FALLBACK}`,
    },
  },

  CLASSIC: {
    label: "Classic",
    note: "Playfair Display over Lato — traditional hotel stationery.",
    display: "Playfair Display",
    ui: "Lato",
    families: ["Playfair+Display:wght@400;500;600;700", "Lato:wght@400;700"],
    stacks: {
      display: `"Playfair Display", ${SERIF_FALLBACK}`,
      ui: `"Lato", ${SANS_FALLBACK}`,
    },
  },

  LUXE: {
    label: "Luxe",
    note: "High-contrast Cormorant with airy Jost — the most formal pairing.",
    display: "Cormorant Garamond",
    ui: "Jost",
    families: ["Cormorant+Garamond:wght@400;500;600;700", "Jost:wght@400;500;600;700"],
    stacks: {
      display: `"Cormorant Garamond", ${SERIF_FALLBACK}`,
      ui: `"Jost", ${SANS_FALLBACK}`,
    },
  },

  SOFT: {
    label: "Soft",
    note: "Rounded Nunito throughout — friendly and approachable.",
    display: "Nunito",
    ui: "Nunito Sans",
    families: ["Nunito:wght@400;600;700;800", "Nunito+Sans:wght@400;600;700"],
    stacks: {
      display: `"Nunito", ${SANS_FALLBACK}`,
      ui: `"Nunito Sans", ${SANS_FALLBACK}`,
    },
  },

  TECHNICAL: {
    label: "Technical",
    note: "Space Grotesk over IBM Plex Sans — precise and a little industrial.",
    display: "Space Grotesk",
    ui: "IBM Plex Sans",
    families: ["Space+Grotesk:wght@400;500;600;700", "IBM+Plex+Sans:wght@400;500;600;700"],
    stacks: {
      display: `"Space Grotesk", ${SANS_FALLBACK}`,
      ui: `"IBM Plex Sans", ${SANS_FALLBACK}`,
    },
  },

  SYSTEM: {
    label: "System",
    note: "No webfonts at all — uses the device's own UI face. Fastest to load.",
    display: "System UI",
    ui: "System UI",
    // Deliberately empty: this preset exists precisely so a deployment on a
    // slow connection (or one that cannot reach Google Fonts) can opt out of
    // the webfont download entirely.
    families: [],
    stacks: {
      display: SANS_FALLBACK,
      ui: SANS_FALLBACK,
    },
  },
};

export const FONT_PRESET_KEYS = Object.keys(FONT_PRESETS);

export const DEFAULT_FONT = "EDITORIAL";

/** Unknown keys fall back to the default rather than rendering unstyled. */
export const resolveFont = (key) => (FONT_PRESETS[key] ? key : DEFAULT_FONT);

/**
 * The Google Fonts URL covering EVERY preset's families.
 *
 * All faces are requested in one stylesheet at boot rather than swapped when
 * the admin picks a preset. That trades a larger first request for two things
 * worth more: the picker can render each tile in its OWN typeface (otherwise
 * every tile would preview in whatever is currently applied), and switching
 * presets is instant with no flash of fallback text.
 *
 * `display=swap` keeps text visible while the faces download, so a slow font
 * load never blanks the page.
 */
export const FONT_PRESET_FAMILIES = [
  ...new Set(FONT_PRESET_KEYS.flatMap((key) => FONT_PRESETS[key].families)),
];

export const FONT_STYLESHEET_HREF = `https://fonts.googleapis.com/css2?${FONT_PRESET_FAMILIES.map(
  (f) => `family=${f}`
).join("&")}&display=swap`;
