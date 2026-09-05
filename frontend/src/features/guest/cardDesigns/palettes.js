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
  /*
   * The Aurora family and its colourways.
   *
   * All five share ONE artwork component (AuroraArt) and differ only in these
   * three stops — that is the whole point of the family: the drawing code is
   * written once and the colourway is data. Adding a sixth is a palette entry
   * plus a registry entry, no new art.
   *
   * Each tier stays recognisably the same colourway, shifted rather than
   * re-hued: Gold warms, Platinum darkens. `ink` must hold DEBOSS text over
   * the mid-tone `b` stop, which is the darkest thing under the type.
   */
  AURORA: {
    SILVER: { a: "#2b3f5c", b: "#6d5b8f", c: "#3f7d8c", ink: "#f2f4f8" },
    GOLD: { a: "#5c3a1e", b: "#8f5b2f", c: "#b8924a", ink: "#fbf2e2" },
    PLATINUM: { a: "#141d2e", b: "#33244a", c: "#1f4a52", ink: "#eceff5" },
  },
  // Tropical: sea-green through turquoise. The coolest colourway.
  AURORA_REEF: {
    SILVER: { a: "#0f4c4a", b: "#1c7a6b", c: "#3fa89a", ink: "#eefaf7" },
    GOLD: { a: "#2d5a33", b: "#4f8f4a", c: "#8fbf5e", ink: "#f4fbe9" },
    PLATINUM: { a: "#08262c", b: "#0f4a4a", c: "#1c6b63", ink: "#e6f4f2" },
  },
  // Sunset: coral through amber. The warmest, and the loudest of the five.
  AURORA_EMBER: {
    SILVER: { a: "#6b2438", b: "#a8433f", c: "#d4763f", ink: "#fdefe7" },
    GOLD: { a: "#7a2f14", b: "#b85f1e", c: "#e8a13f", ink: "#fef3e0" },
    PLATINUM: { a: "#2e0f1c", b: "#5c2029", c: "#8f3b2f", ink: "#f8e8e4" },
  },
  // Violet through magenta — the most saturated colourway.
  AURORA_ORCHID: {
    SILVER: { a: "#3d1f5c", b: "#7b3f9e", c: "#b85fa8", ink: "#f9ecf8" },
    GOLD: { a: "#5c2f5e", b: "#96479a", c: "#c97fb0", ink: "#fbeef7" },
    PLATINUM: { a: "#1c0f2e", b: "#3d2054", c: "#5f3378", ink: "#f0e8f8" },
  },
  // Near-monochrome: graphite through pewter, with only a hint of blue. The
  // restrained option for a property that does not want colour on its card.
  AURORA_FROST: {
    SILVER: { a: "#2f3742", b: "#4f5a68", c: "#7d8894", ink: "#f4f6f8" },
    GOLD: { a: "#3d3830", b: "#635a48", c: "#8f8468", ink: "#faf6ec" },
    PLATINUM: { a: "#14181e", b: "#252c36", c: "#3d4650", ink: "#eceff3" },
  },
  MARBLE: {
    SILVER: { stock: "#eceae5", vein: "rgba(90,95,105,.30)", acc: "#5a5f69", ink: "#22242a" },
    GOLD: { stock: "#f2ece0", vein: "rgba(150,116,54,.32)", acc: "#967436", ink: "#2a2419" },
    PLATINUM: { stock: "#1a1c21", vein: "rgba(190,196,210,.22)", acc: "#aeb4c0", ink: "#eceef3" },
  },
  CARBON: {
    SILVER: { base: "#191a1d", weave: "rgba(255,255,255,.05)", acc: "#b9bcc4", ink: "#eceef1" },
    GOLD: { base: "#1a1712", weave: "rgba(255,225,170,.055)", acc: "#c9a153", ink: "#f5eddc" },
    PLATINUM: { base: "#0d0e11", weave: "rgba(190,200,220,.05)", acc: "#98a0b0", ink: "#e8eaef" },
  },
  /*
   * The Insignia family: four designs that each make the Billionax mark the
   * hero rather than a corner ornament. `acc` is the mark's own colour, so it
   * must hold against `bg` on its own — it is the largest element on the card.
   */
  CREST: {
    SILVER: { bg: "#16181d", acc: "#c9ccd3", halo: "rgba(201,204,211,.13)", ink: "#f1f2f5" },
    GOLD: { bg: "#17130c", acc: "#d3ab5a", halo: "rgba(211,171,90,.14)", ink: "#f8f0dd" },
    PLATINUM: { bg: "#0a0c11", acc: "#a8b0c0", halo: "rgba(168,176,192,.12)", ink: "#e9ecf2" },
  },
  EMBLEM: {
    SILVER: { stock: "#eeece7", mark: "#3f434b", band: "#5a5f69", ink: "#22242a" },
    GOLD: { stock: "#f4eee1", mark: "#8a6a2f", band: "#a8894a", ink: "#2a2419" },
    PLATINUM: { stock: "#15171b", mark: "#aeb4c0", band: "#5f6672", ink: "#eceef3" },
  },
  IMPRINT: {
    SILVER: { a: "#8e9299", b: "#585d66", c: "#b6bac1", ink: "#f5f6f8" },
    GOLD: { a: "#94794a", b: "#5a4726", c: "#bda169", ink: "#f9f1de" },
    PLATINUM: { a: "#3a3d44", b: "#191b20", c: "#5b606a", ink: "#eaecf0" },
  },
  SIGNET: {
    SILVER: { bg: "#1d2430", acc: "#cfd4dd", ring: "rgba(207,212,221,.18)", ink: "#f2f4f7" },
    GOLD: { bg: "#221a10", acc: "#dcb262", ring: "rgba(220,178,98,.18)", ink: "#faf2e2" },
    PLATINUM: { bg: "#0d1017", acc: "#9fa8b8", ring: "rgba(159,168,184,.16)", ink: "#e8ebf1" },
  },
  HORIZON: {
    SILVER: { top: "#4a5a72", bottom: "#232b38", sun: "#c3ccda", ink: "#f1f3f7" },
    GOLD: { top: "#a86a34", bottom: "#3d2415", sun: "#f0c274", ink: "#fdf3e4" },
    PLATINUM: { top: "#232c3f", bottom: "#0b0e15", sun: "#9fa9bd", ink: "#eaedf3" },
  },
};
