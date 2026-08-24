/**
 * Per-family, per-tier colour for the membership-card art.
 *
 * Lifted verbatim from the design mockups so the app matches what was signed
 * off. Kept apart from the components because the palettes are data — a tweak
 * to Gold should not mean touching drawing code.
 *
 * Every family defines all three tiers. A missing tier would render a card
 * with `undefined` fills, which reads as broken rather than as a fallback, so
 * the resolver in index.jsx defaults the TIER as well as the family.
 */

export const TIERS = ["SILVER", "GOLD", "PLATINUM"];

export const PALETTES = {
  METALICA: {
    SILVER: { base: "#121214", foilA: "#f3f3f3", foilB: "#8a8a8a", foilC: "#d6d6d6" },
    GOLD: { base: "#121212", foilA: "#f2dc9b", foilB: "#9a7a35", foilC: "#e0b15c" },
    PLATINUM: { base: "#0a0a0b", foilA: "#e8e8ee", foilB: "#3d3f47", foilC: "#9ea2ad" },
  },
  BRUSHED_STEEL: {
    SILVER: { a: "#9b9b9b", b: "#5e5e5e", c: "#c4c4c4", ink: "#f4f4f4" },
    GOLD: { a: "#8f7a4f", b: "#4f4128", c: "#b89a5e", ink: "#f6efdc" },
    PLATINUM: { a: "#3b3c40", b: "#1a1b1e", c: "#5d5f66", ink: "#e8e9ed" },
  },
  ORNAMENT: {
    SILVER: { bg: "#6e6e6e", tile: "rgba(255,255,255,.16)", tile2: "rgba(0,0,0,.22)", ink: "#f5f5f5" },
    GOLD: { bg: "#8e6c3d", tile: "rgba(255,230,170,.22)", tile2: "rgba(60,35,5,.3)", ink: "#fbf3df" },
    PLATINUM: { bg: "#1f2127", tile: "rgba(200,205,220,.16)", tile2: "rgba(0,0,0,.4)", ink: "#eef0f5" },
  },
  AURUM: {
    SILVER: { edge: "#c2c2c2", acc: "#d6d6d6", net: "rgba(214,214,214,.35)" },
    GOLD: { edge: "#c9a456", acc: "#e0b15c", net: "rgba(224,177,92,.4)" },
    PLATINUM: { edge: "#8b8f9c", acc: "#b8bcc8", net: "rgba(184,188,200,.35)" },
  },
  FACET: {
    SILVER: { h: [210, 212, 214], s: [8, 10, 6], l: [38, 52, 28] },
    GOLD: { h: [36, 38, 32], s: [55, 60, 48], l: [30, 42, 22] },
    PLATINUM: { h: [225, 230, 220], s: [14, 16, 10], l: [9, 16, 5] },
  },
  LEDGER: {
    SILVER: { bg: "#2b2c2f", line: "rgba(220,220,220,.22)", acc: "#cfd0d2" },
    GOLD: { bg: "#26221b", line: "rgba(224,177,92,.22)", acc: "#e0b15c" },
    PLATINUM: { bg: "#0f1013", line: "rgba(200,205,220,.18)", acc: "#b9bdc9" },
  },
  KEYCARD: {
    SILVER: { stock: "#e9e7e1", band: "#8f9196", ink: "#1a1916" },
    GOLD: { stock: "#eee8da", band: "#b8924a", ink: "#1a1916" },
    PLATINUM: { stock: "#1c1c1e", band: "#b9bdc9", ink: "#ecebe6" },
  },
  MONOGRAM: {
    SILVER: { bg: "#141a26", acc: "#c9ccd3", ring: "rgba(201,204,211,.14)" },
    GOLD: { bg: "#0e1726", acc: "#e0b15c", ring: "rgba(224,177,92,.14)" },
    PLATINUM: { bg: "#0a0d14", acc: "#a8adbb", ring: "rgba(168,173,187,.14)" },
  },
};
