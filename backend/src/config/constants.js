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
});

export const TX_TYPE_VALUES = Object.values(TX_TYPES);

export const VOUCHER_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  REDEEMED: "REDEEMED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
});

export const VOUCHER_STATUS_VALUES = Object.values(VOUCHER_STATUS);

export const CONTENT_KINDS = Object.freeze({
  CONTENT: "CONTENT",
  OFFER: "OFFER",
  // A standing benefit of membership ("Breakfast — Included"), optionally
  // restricted to certain tiers. Unlike an OFFER it has no date window.
  PRIVILEGE: "PRIVILEGE",
});

export const CONTENT_KIND_VALUES = Object.values(CONTENT_KINDS);

export const PURCHASE_STATUS = Object.freeze({
  COMPLETED: "COMPLETED",
  VOID: "VOID",
});

export const PURCHASE_STATUS_VALUES = Object.values(PURCHASE_STATUS);

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
});

export const NOTIFICATION_KIND_VALUES = Object.values(NOTIFICATION_KINDS);

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
});

export const CARD_DESIGN_VALUES = Object.values(CARD_DESIGNS);

/** Brushed steel is the house default. */
export const DEFAULT_CARD_DESIGN = CARD_DESIGNS.BRUSHED_STEEL;
