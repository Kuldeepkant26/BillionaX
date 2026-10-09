/**
 * Which kind of perk a privilege is — dining, wellness, a room benefit — read
 * from the words the hotel already wrote.
 *
 * Privileges have no category field. Hotels type a title, an optional value
 * and a description, and that is all the card has to go on. The redesigned
 * card still needs a category for three things: the icon in its corner chip,
 * the chip's label, and whether it is set dark or cream. Deriving it here
 * keeps that a presentation decision with no schema change, no migration and
 * nothing for a hotel to fill in.
 *
 * Deliberately conservative. A miss lands on PERK — a neutral "Privilege"
 * chip with a spark — so the worst a misread title can do is look generic. It
 * can never put a spa icon on a breakfast.
 *
 * Pure and dependency-free, so tests/privilegeCategory.test.js can import it
 * directly.
 */

/*
 * `tone` is the card's ground. The client's reference sets each kind of perk
 * against the light it is enjoyed in — the bar and the room after dark, the
 * spa and breakfast in daylight — and hotels' own photography tends to follow
 * suit, which is what keeps a cream ground from washing over a dark photo.
 * Anything unrecognised is dark: a dark ground flatters any photo, a cream one
 * only a bright one.
 *
 * `eyebrow` is only the fallback for a privilege with no value label. The
 * label ("Till 8pm", "20% off") is what the guest actually gets, so it takes
 * the eyebrow whenever the hotel has written one.
 *
 * `short` is the chip label on a narrow card (a 360px phone), where the full
 * one would squeeze the eyebrow beside it into breaking mid-word. The card
 * swaps them with a container query on its own width.
 */
export const PRIVILEGE_CATEGORIES = Object.freeze({
  BREAKFAST: { chip: "Dining", short: "Dining", eyebrow: "Breakfast & more", icon: "cup", tone: "light" },
  DINING: { chip: "Food & beverage", short: "Dining", eyebrow: "Dining & bars", icon: "cutlery", tone: "dark" },
  WELLNESS: { chip: "Spa & wellness", short: "Spa", eyebrow: "Wellness & spa", icon: "lotus", tone: "light" },
  STAY: { chip: "Stay", short: "Stay", eyebrow: "Stay enhancements", icon: "bed", tone: "dark" },
  TRAVEL: { chip: "Travel", short: "Travel", eyebrow: "Arrivals & transfers", icon: "car", tone: "dark" },
  PERK: { chip: "Privilege", short: "Privilege", eyebrow: "Member exclusive", icon: "spark", tone: "dark" },
});

/*
 * Checked in THIS order, and the first hit wins — the order is the
 * tie-breaker. "Breakfast at the restaurant" is breakfast, not dining; "Pool
 * bar" is a bar, not the pool; "Spa suite upgrade" is the spa, not the room.
 *
 * Whole words only (see `matches`), so "bar" never fires on "barber" or
 * "minibar", "spa" never on "space", "tea" never on "steak".
 *
 * Left out on purpose: "night" ("Ladies' night" is a bar promotion, not a
 * room), "lounge" (club, bar and airport lounges are three different perks)
 * and "treatment" ("VIP treatment" is not a massage). Each was a wrong icon
 * waiting to happen; PERK is the honest answer for them.
 */
const RULES = [
  [
    "BREAKFAST",
    [
      "breakfast",
      "breakfasts",
      "brunch",
      "coffee",
      "coffees",
      "tea",
      "teas",
      "high tea",
      "cafe",
      "bakery",
      "pastry",
      "pastries",
    ],
  ],
  [
    "DINING",
    [
      "bar",
      "bars",
      "happy hour",
      "happy hours",
      "drink",
      "drinks",
      "cocktail",
      "cocktails",
      "mocktail",
      "mocktails",
      "wine",
      "wines",
      "beer",
      "beers",
      "whisky",
      "whiskey",
      "champagne",
      "pub",
      "beverage",
      "beverages",
      "dining",
      "dine",
      "dinner",
      "dinners",
      "lunch",
      "lunches",
      "restaurant",
      "restaurants",
      "meal",
      "meals",
      "buffet",
      "food",
      "cuisine",
      "chef",
      "menu",
      "bistro",
      "grill",
      "barbecue",
      "bbq",
      "room service",
      "f&b",
    ],
  ],
  [
    "WELLNESS",
    [
      "spa",
      "spas",
      "massage",
      "massages",
      "wellness",
      "sauna",
      "steam",
      "hammam",
      "jacuzzi",
      "salon",
      "facial",
      "facials",
      "ayurveda",
      "ayurvedic",
      "yoga",
      "meditation",
      "gym",
      "fitness",
      "pool",
      "pools",
      "swim",
      "swimming",
      "therapy",
      "therapies",
    ],
  ],
  [
    "STAY",
    [
      "room",
      "rooms",
      "suite",
      "suites",
      "upgrade",
      "upgrades",
      "checkout",
      "check out",
      "check-out",
      "checkin",
      "check in",
      "check-in",
      "late checkout",
      "early check-in",
      "stay",
      "stays",
      "bed",
      "beds",
      "turndown",
      "minibar",
      "housekeeping",
      "accommodation",
    ],
  ],
  [
    "TRAVEL",
    [
      "airport",
      "transfer",
      "transfers",
      "pickup",
      "pick-up",
      "pick up",
      "drop-off",
      "drop off",
      "chauffeur",
      "limousine",
      "limo",
      "shuttle",
      "car",
      "cab",
      "taxi",
    ],
  ],
];

/*
 * Lower-cased, accents folded ("Café" → "cafe") and every run of anything
 * that is not a letter, digit, "&" or "-" collapsed to one space. Hyphens
 * survive so "check-in" can be listed as written; the spaced and joined
 * spellings are listed beside it.
 */
const normalise = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9&-]+/g, " ")
    .trim();

/* Whole-word containment on the normalised text, padded so a keyword at either
   end still has a space on both sides. */
const matches = (text, keyword) => ` ${text} `.includes(` ${keyword} `);

const classify = (text) => {
  const value = normalise(text);
  if (!value) return null;
  for (const [key, keywords] of RULES) {
    if (keywords.some((keyword) => matches(value, keyword))) return key;
  }
  return null;
};

/**
 * The category key for a privilege.
 *
 * The title is read first and on its own, because it is the hotel naming the
 * perk. The description only breaks a tie when the title says nothing: it is
 * free prose, and "Buffet breakfast for two, every morning of your stay" would
 * otherwise be as much a room perk as a breakfast one.
 *
 * `outlet` comes between the two. The admin form does not offer it, but every
 * seeded default carries one ("Bar", "Spa", "Rooms").
 */
export const privilegeCategoryKey = (privilege) =>
  classify(privilege?.title) ||
  classify(privilege?.outlet) ||
  classify(privilege?.description) ||
  "PERK";

export const privilegeCategory = (privilege) => PRIVILEGE_CATEGORIES[privilegeCategoryKey(privilege)];

/*
 * The width the card and the details sheet both request a photo at. The guest
 * shell is at most 460px wide, so one size covers the card's photo and the
 * sheet's full-width hero — the sheet then opens on the card's cached
 * download instead of fetching a second size. It is passed to feedImage, the
 * generic "photo at display width" helper despite its name: f_auto/q_auto on
 * a Cloudinary upload, untouched for any other host, so a hotel's 5MB
 * original never lands on the home screen.
 */
export const PRIVILEGE_PHOTO_WIDTH = 460;

/** What the card's eyebrow says: the hotel's own value label, else the category. */
export const privilegeEyebrow = (privilege) =>
  String(privilege?.valueLabel ?? "").trim() || privilegeCategory(privilege).eyebrow;
