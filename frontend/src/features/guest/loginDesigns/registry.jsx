import {
  VoidArt,
  HaloArt,
  VignetteArt,
  AtelierArt,
  ColonnadeArt,
  MeridianArt,
  BlueprintArt,
  EscarpArt,
  MonolithArt,
  RegencyArt,
  OpulenceArt,
  ImperialArt,
} from "./artwork.jsx";

/**
 * The sign-in screen design registry.
 *
 * WHAT A DESIGN IS, AND IS NOT.
 *
 * A design supplies the screen's CHROME: the backdrop art, how the brand sits
 * in it, and the shape of the join between the band and the form. It does NOT
 * supply the form. Every design renders the same email/OTP form, from one
 * implementation in JoinPage.
 *
 * That split is deliberate and worth keeping. The sign-in form is the only
 * unauthenticated write path in the app, and the OTP flow underneath it has
 * real rules — a resend cooldown the API rate-limits against, a code length
 * read from the server, digit filtering on paste. Twelve copies of that would
 * be twelve chances to get it subtly wrong. So the designs are art and layout
 * only, and the flow has exactly one implementation.
 *
 * COLOUR IS NOT A DESIGN'S JOB EITHER. Every design paints from the theme
 * tokens, so the admin's accent choice and the guest's light/dark choice
 * still apply. 12 designs x 27 accents x 2 modes, from 12 entries.
 *
 * Keys mirror LOGIN_DESIGNS in the API's constants.js. The main admin stores
 * a key; nothing here is admin-supplied, so no markup crosses the wire —
 * which matters most on this screen, because it renders to anyone with the
 * URL and no token.
 *
 * ADDING A DESIGN: add the key in both places, add an entry here, and it
 * shows up in the admin picker automatically — the picker maps over this
 * registry. backend/tests/loginDesign.test.js fails if the two lists drift.
 */

/**
 * The picker's sections, in display order.
 *
 * Purely PRESENTATION, exactly like CARD_CATEGORIES: the API stores a flat
 * design key and knows nothing about these, so a design can be refiled into
 * another section without a migration.
 */
export const LOGIN_CATEGORIES = [
  {
    key: "PREMIUM",
    label: "Premium",
    note: "Deep grounds and one confident gesture. Restraint is the point.",
  },
  {
    key: "MODERN",
    label: "Modern",
    note: "Hard-edged structure and high contrast. Geometry, not texture.",
  },
  {
    key: "LUXE",
    label: "Luxe",
    note: "Ornament, gloss and repeated motif. Where Premium withholds, this performs.",
  },
  {
    key: "MINIMAL",
    label: "Minimal",
    note: "No band and no artwork. The mark and the form, centred on the page.",
  },
];

export const LOGIN_CATEGORY_KEYS = LOGIN_CATEGORIES.map((c) => c.key);

/**
 * Atelier is the default: the most broadly wearable of the twelve, and the
 * one that holds up across the widest range of accents. Must match
 * DEFAULT_LOGIN_DESIGN in the API.
 */
export const DEFAULT_LOGIN_DESIGN = "ATELIER";

/*
 * Each entry's `chrome` describes the frame:
 *
 *   art       the backdrop component, painted behind everything
 *   join      how the sheet meets the band: "arc" | "bevel" | "straight"
 *   brand     where the brand sits: "left" | "center"
 *   onDark    true when the band is the accent (so brand text is white);
 *             false when it is the page ground (so brand text is --fg).
 *   band      how tall the band is, as a share of the screen: "tall" |
 *             "mid" | "short" | "none"
 *   align     form text alignment: "center" | "left"
 *
 * band: "none" is the MINIMAL family and is a different composition, not a
 * shorter band: there is no band, no join, and the brand sits directly above
 * the form in one stack centred in the viewport. JoinPage keys the centred
 * layout off it (see .stack in the stylesheet), and a design using it must
 * also set join: "straight" and brand: "center" — the other joins cut an edge
 * that no longer exists, and a left-set brand breaks the stack's axis.
 *
 * JoinPage reads these rather than each design returning markup, so one form
 * implementation serves every design — see the note at the top.
 *
 * The nine banded designs set onDark: true — they are built on --hero, and a
 * brand sitting on a saturated accent needs white type. The MINIMAL three set
 * onDark: false: they paint on the page ground, where white would vanish in
 * light mode, so the brand takes --fg and follows the theme instead.
 */
export const LOGIN_DESIGNS = {
  /* ------------------------------- minimal ------------------------------ */
  MONOGRAM: {
    label: "Monogram",
    note: "The mark and the form, centred on a bare page. Nothing else at all.",
    category: "MINIMAL",
    chrome: { art: VoidArt, join: "straight", brand: "center", onDark: false, band: "none", align: "center" },
  },
  HALO: {
    label: "Halo",
    note: "A single soft pool of accent behind the mark. The quietest colour in the set.",
    category: "MINIMAL",
    chrome: { art: HaloArt, join: "straight", brand: "center", onDark: false, band: "none", align: "center" },
  },
  VIGNETTE: {
    label: "Vignette",
    note: "A soft pool of light at the top, settling to a shaded foot.",
    category: "MINIMAL",
    chrome: { art: VignetteArt, join: "straight", brand: "center", onDark: false, band: "none", align: "center" },
  },

  /* ------------------------------- premium ------------------------------ */
  ATELIER: {
    label: "Atelier",
    note: "A single struck arc over a deep ground. The house default.",
    category: "PREMIUM",
    chrome: { art: AtelierArt, join: "arc", brand: "left", onDark: true, band: "tall", align: "left" },
  },
  COLONNADE: {
    label: "Colonnade",
    note: "Evenly spaced piers receding into the ground. Architectural and still.",
    category: "PREMIUM",
    chrome: { art: ColonnadeArt, join: "straight", brand: "center", onDark: true, band: "tall", align: "center" },
  },
  MERIDIAN: {
    label: "Meridian",
    note: "A low horizon with one accent band above it. The quietest of the set.",
    category: "PREMIUM",
    chrome: { art: MeridianArt, join: "bevel", brand: "left", onDark: true, band: "mid", align: "left" },
  },

  /* -------------------------------- modern ------------------------------ */
  BLUEPRINT: {
    label: "Blueprint",
    note: "A measured grid with one heavy axis and a marked origin.",
    category: "MODERN",
    chrome: { art: BlueprintArt, join: "straight", brand: "left", onDark: true, band: "mid", align: "left" },
  },
  ESCARP: {
    label: "Escarp",
    note: "Two hard diagonal planes split by an accent edge. No blur anywhere.",
    category: "MODERN",
    chrome: { art: EscarpArt, join: "bevel", brand: "left", onDark: true, band: "mid", align: "left" },
  },
  MONOLITH: {
    label: "Monolith",
    note: "One oversized block, cropped by the frame. Deliberately off-balance.",
    category: "MODERN",
    chrome: { art: MonolithArt, join: "straight", brand: "left", onDark: true, band: "tall", align: "left" },
  },

  /* --------------------------------- luxe ------------------------------- */
  REGENCY: {
    label: "Regency",
    note: "A diamond lattice under a bright sheen. Tiled, never stretched.",
    category: "LUXE",
    chrome: { art: RegencyArt, join: "arc", brand: "center", onDark: true, band: "tall", align: "center" },
  },
  OPULENCE: {
    label: "Opulence",
    note: "Concentric rings struck from off-frame, with an accent bloom.",
    category: "LUXE",
    chrome: { art: OpulenceArt, join: "arc", brand: "left", onDark: true, band: "tall", align: "left" },
  },
  IMPERIAL: {
    label: "Imperial",
    note: "A crowned arch on a ray field. The most formal composition here.",
    category: "LUXE",
    chrome: { art: ImperialArt, join: "bevel", brand: "center", onDark: true, band: "tall", align: "center" },
  },
};

/** A stored key this registry does not know falls back to the default, so a
    removed design can never leave a guest unable to sign in. */
export const resolveLoginDesign = (key) =>
  LOGIN_DESIGNS[key] || LOGIN_DESIGNS[DEFAULT_LOGIN_DESIGN];

export const LOGIN_DESIGN_KEYS = Object.keys(LOGIN_DESIGNS);

/**
 * The picker's sections with their design keys attached, in display order.
 *
 * A design whose `category` names no section falls into the LAST one rather
 * than vanishing — the same guarantee CARD_CATEGORY_GROUPS makes. Silently
 * dropping it would leave the flat key list looking correct while the admin
 * had no way to select it, which is exactly the bug the picker test catches.
 */
export const LOGIN_CATEGORY_GROUPS = (() => {
  const fallback = LOGIN_CATEGORY_KEYS[LOGIN_CATEGORY_KEYS.length - 1];
  const buckets = Object.fromEntries(LOGIN_CATEGORY_KEYS.map((key) => [key, []]));

  for (const key of LOGIN_DESIGN_KEYS) {
    const { category } = LOGIN_DESIGNS[key];
    buckets[buckets[category] ? category : fallback].push(key);
  }

  return LOGIN_CATEGORIES.map((category) => ({
    ...category,
    keys: buckets[category.key],
  }));
})();
