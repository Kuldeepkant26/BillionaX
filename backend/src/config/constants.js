export const ROLES = Object.freeze({
  MAIN_ADMIN: "MAIN_ADMIN",
  HOTEL_ADMIN: "HOTEL_ADMIN",
  HOTEL_STAFF: "HOTEL_STAFF",
  GUEST: "GUEST",
});

export const ROLE_VALUES = Object.values(ROLES);

export const TIERS = Object.freeze({
  SILVER: "SILVER",
  GOLD: "GOLD",
  PLATINUM: "PLATINUM",
});

export const TIER_VALUES = Object.values(TIERS);

export const TX_TYPES = Object.freeze({
  WELCOME: "WELCOME",
  EARN: "EARN",
  // A stay a manager recorded from the Members table: nights + amount, credited
  // at the guest's tier rate. Separate from EARN so nights-bearing stays stay
  // auditable apart from the older room x nights x rate allocations.
  STAY: "STAY",
  REDEEM: "REDEEM",
  ADJUSTMENT: "ADJUSTMENT",
  /**
   * The month-end rebate: a share of the coins guests redeemed at a hotel is
   * credited back to that hotel's inventory. Its own type rather than an
   * ADJUSTMENT so the rebate is auditable on its own, and so it can never be
   * confused with coins the hotel actually paid for.
   *
   * Carries hotelId but no guestId or membershipId — it moves hotel inventory,
   * not any guest's balance.
   */
  REBATE: "REBATE",
});

export const TX_TYPE_VALUES = Object.values(TX_TYPES);

export const VOUCHER_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  REDEEMED: "REDEEMED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

export const VOUCHER_STATUS_VALUES = Object.values(VOUCHER_STATUS);

/**
 * A staff-composed bill's lifecycle.
 *
 * PENDING is the only state a guest can act on, and the only one a payment can
 * be attached to. Every terminal state is reached exactly once — the status
 * flip is the mutex, the same trick VOUCHER_STATUS used to make a code
 * single-use.
 *
 * A failed payment deliberately has NO status of its own: the bill stays
 * PENDING so the guest can simply try again. A FAILED state would either
 * strand the bill or need a second transition back, and both are worse than
 * doing nothing.
 */
export const BILL_STATUS = Object.freeze({
  PENDING: "PENDING",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
});

export const BILL_STATUS_VALUES = Object.values(BILL_STATUS);

export const CONTENT_KINDS = Object.freeze({
  // A photo in the hotel's home-screen slideshow. Images only.
  CONTENT: "CONTENT",
  OFFER: "OFFER",
  // A standing benefit of membership ("Breakfast — Included"), optionally
  // restricted to certain tiers. Unlike an OFFER it has no date window.
  PRIVILEGE: "PRIVILEGE",
  // A video in the guest's video feed.
  //
  // Its own kind rather than "any row that happens to have a videoUrl": that
  // rule quietly made every offer with a clip a video too, so one item showed
  // up in two places and staff had no single list of their videos. A video is
  // now a thing you create, not a side effect of filling in a field.
  VIDEO: "VIDEO",
});

export const CONTENT_KIND_VALUES = Object.values(CONTENT_KINDS);

/**
 * How long an expired offer stays visible to STAFF before it is deleted.
 *
 * Guests stop seeing it the moment its deadline passes — that is a query
 * predicate, not this. This is only the window in which a manager can still
 * review or duplicate the offer before it and its image are gone for good.
 */
export const OFFER_GRACE_DAYS = 7;

export const PURCHASE_STATUS = Object.freeze({
  COMPLETED: "COMPLETED",
  VOID: "VOID",
});

export const PURCHASE_STATUS_VALUES = Object.values(PURCHASE_STATUS);

/**
 * The seven outlets the platform shipped with.
 *
 * NO LONGER THE AUTHORITATIVE SET. Each hotel now owns its own services — see
 * hotelService.model.js — and this list survives for exactly two jobs:
 *
 *   1. The seed for a new hotel's services (config/defaultServices.js).
 *   2. The enum on Bill.outlet and the historical filters over it, which read
 *      values written before services existed.
 *
 * Adding a name here does NOT give any hotel a new service; a hotel adds one
 * from its own panel.
 */
export const OUTLETS = Object.freeze([
  "Restaurant",
  "Room Service",
  "Spa",
  "Bar",
  "Cafe",
  "Laundry",
  "Other",
]);

/** Roles that belong to a hotel and therefore require a hotelId. */
export const HOTEL_SCOPED_ROLES = [ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF];

/**
 * Notification kinds for notices that have NO ledger row behind them.
 * Coin activity is projected from CoinTransaction and uses TX_TYPES instead.
 */
export const NOTIFICATION_KINDS = Object.freeze({
  TIER_UP: "TIER_UP",
  HOTEL_JOINED: "HOTEL_JOINED",
  VOUCHER_ISSUED: "VOUCHER_ISSUED",
  VOUCHER_EXPIRING: "VOUCHER_EXPIRING",
  VOUCHER_CANCELLED: "VOUCHER_CANCELLED",
  SYSTEM: "SYSTEM",
  /**
   * The platform team answered a support thread.
   *
   * Used on the GUEST channel only. Hotel admins are told through their
   * panel's own badge instead — the Notification collection is the guest
   * alerts feed, and a hotel admin has no screen that reads it.
   */
  SUPPORT_REPLY: "SUPPORT_REPLY",
});

export const NOTIFICATION_KIND_VALUES = Object.values(NOTIFICATION_KINDS);

/**
 * Which SIDE of a support conversation a message came from.
 *
 * Two values, not a role: a client renders a bubble left or right, and it must
 * not have to know whether a MAIN_ADMIN or some future support role typed it.
 * Who actually typed it is stored as authorId alongside.
 *
 * The names are historical. GUEST means "the person who owns this thread" —
 * on a hotel thread that is the hotel admin, not a guest — and ADMIN means
 * "the platform team". They were not renamed to OWNER/PLATFORM because the
 * values are persisted on every existing row, and a rename would be a data
 * migration that buys nothing a comment cannot.
 */
export const SUPPORT_SENDERS = Object.freeze({
  GUEST: "GUEST",
  ADMIN: "ADMIN",
});

export const SUPPORT_SENDER_VALUES = Object.values(SUPPORT_SENDERS);

/**
 * Which support CHANNEL a thread belongs to.
 *
 * Three queues, separated here rather than merged and filtered in the UI,
 * because each has a different audience and a different response expectation:
 *
 *   GUEST       guest            -> the platform team   (account, coins, bills)
 *   HOTEL       hotel manager    -> the platform team   (their property)
 *   HOTEL_GUEST guest            -> their hotel's desk  (the stay itself)
 *
 * Stored on the message rather than derived from the owner's role, because a
 * role can change: promoting a hotel admin must not silently move their
 * conversation history into the guest queue.
 *
 * HOTEL_GUEST is the one channel the platform team is NOT a party to. It is
 * also the only one whose thread key is a PAIR — a guest belongs to many
 * hotels, so `userId` alone does not name a conversation; see
 * SUPPORT_HOTEL_SCOPED_PARTIES below and the model's thread-key index.
 */
export const SUPPORT_PARTIES = Object.freeze({
  GUEST: "GUEST",
  HOTEL: "HOTEL",
  HOTEL_GUEST: "HOTEL_GUEST",
});

export const SUPPORT_PARTY_VALUES = Object.values(SUPPORT_PARTIES);

/**
 * The channels whose threads are keyed by {userId, hotelId} rather than userId.
 *
 * A named set rather than an inline `=== HOTEL_GUEST` at each call site: every
 * query that forgets to add hotelId silently reads ACROSS a guest's hotels,
 * which is a disclosure bug that returns plausible-looking data. Asking this
 * predicate is what makes the omission hard.
 */
export const SUPPORT_HOTEL_SCOPED_PARTIES = Object.freeze([SUPPORT_PARTIES.HOTEL_GUEST]);

export const isHotelScopedParty = (party) => SUPPORT_HOTEL_SCOPED_PARTIES.includes(party);

/**
 * Membership-card art. The main admin picks one and it applies network-wide.
 *
 * These are KEYS ONLY — every design is drawn in the guest app (see the
 * frontend's cardDesigns registry). Storing a key rather than markup keeps the
 * payload small and means nothing renders admin-supplied HTML.
 *
 * A key here that the frontend does not know falls back to the default, so
 * removing a design cannot leave guests with a blank card. Keep the two lists
 * in step.
 */
export const CARD_DESIGNS = Object.freeze({
  METALICA: "METALICA",
  BRUSHED_STEEL: "BRUSHED_STEEL",
  ORNAMENT: "ORNAMENT",
  AURUM: "AURUM",
  FACET: "FACET",
  LEDGER: "LEDGER",
  KEYCARD: "KEYCARD",
  MONOGRAM: "MONOGRAM",
  AURORA: "AURORA",
  MARBLE: "MARBLE",
  CARBON: "CARBON",
  HORIZON: "HORIZON",
  // The Aurora colourways. One drawing, five palettes — see the frontend's
  // cardDesigns registry.
  AURORA_REEF: "AURORA_REEF",
  AURORA_EMBER: "AURORA_EMBER",
  AURORA_ORCHID: "AURORA_ORCHID",
  AURORA_FROST: "AURORA_FROST",
  // The Insignia family, built around the Billionax mark.
  CREST: "CREST",
  EMBLEM: "EMBLEM",
  IMPRINT: "IMPRINT",
  SIGNET: "SIGNET",
});

export const CARD_DESIGN_VALUES = Object.values(CARD_DESIGNS);

/** Brushed steel is the house default. */
export const DEFAULT_CARD_DESIGN = CARD_DESIGNS.BRUSHED_STEEL;

/**
 * Dashboard/app colour theme. The main admin picks one and it applies
 * network-wide — to the admin panel, the hotel panels, and the guest app's
 * accent colours (guests keep their own light/dark choice).
 *
 * Like CARD_DESIGNS these are KEYS ONLY — every palette is defined in the
 * frontend's accentPresets registry, so nothing renders admin-supplied CSS.
 * A key the frontend does not know falls back to the default. Keep the two
 * lists in step (see tests/themePreset.test.js).
 *
 * The presets are grouped into categories (Soft, Premium, Light, Vivid,
 * Classic) for the admin picker. That grouping is PRESENTATION and lives only
 * in the frontend registry — the API stores a flat key, so a preset can be
 * refiled into another section without a migration. The comments below only
 * mirror the sections to keep the list readable.
 */
export const THEME_PRESETS = Object.freeze({
  // Soft — low saturation, gentle contrast.
  SAND: "SAND",
  LAVENDER: "LAVENDER",
  TEAL: "TEAL",
  ROSE: "ROSE",
  SAGE: "SAGE",
  CLAY: "CLAY",

  // Premium — deep jewelled colour on near-black rails.
  CHAMPAGNE: "CHAMPAGNE",
  EMERALD: "EMERALD",
  OBSIDIAN: "OBSIDIAN",
  BURGUNDY: "BURGUNDY",
  ONYX_JADE: "ONYX_JADE",
  PLUM: "PLUM",

  // Light & airy — the only group with pale rails.
  LINEN: "LINEN",
  MIST: "MIST",
  BLUSH: "BLUSH",
  MEADOW: "MEADOW",

  // Vivid — saturated and high-energy.
  CORAL: "CORAL",
  INDIGO: "INDIGO",
  SAFFRON: "SAFFRON",
  FUCHSIA: "FUCHSIA",
  VIRIDIAN: "VIRIDIAN",

  // Classic — restrained business palettes.
  OCEAN: "OCEAN",
  MIDNIGHT: "MIDNIGHT",
  MONO: "MONO",
  SLATE: "SLATE",
  FOREST: "FOREST",
  // The admin's own colour from the wheel. The hue itself rides in
  // `themeCustomColor` — this key only says "use that colour".
  CUSTOM: "CUSTOM",
});

export const THEME_PRESET_VALUES = Object.values(THEME_PRESETS);

export const DEFAULT_THEME_PRESET = THEME_PRESETS.CORAL;

/**
 * Typeface pairing for the whole app. Like THEME_PRESETS, the main admin picks
 * one and it applies network-wide — panels and the guest app alike.
 *
 * KEYS ONLY, for the same reason: the font stacks live in the frontend's
 * fontPresets registry and are applied by attribute, so no admin-supplied
 * value ever reaches a `font-family` declaration. A key the frontend does not
 * know falls back to the default. Keep the two lists in step (see
 * tests/fontPreset.test.js).
 *
 * Each key names a PAIR — a display face and a UI face — because the two have
 * to be chosen against each other. SYSTEM is the no-webfont option.
 */
export const FONT_PRESETS = Object.freeze({
  EDITORIAL: "EDITORIAL",
  MODERN: "MODERN",
  CLASSIC: "CLASSIC",
  LUXE: "LUXE",
  SOFT: "SOFT",
  TECHNICAL: "TECHNICAL",
  SYSTEM: "SYSTEM",
});

export const FONT_PRESET_VALUES = Object.values(FONT_PRESETS);

/** The pairing the app shipped with. */
export const DEFAULT_FONT_PRESET = FONT_PRESETS.EDITORIAL;
