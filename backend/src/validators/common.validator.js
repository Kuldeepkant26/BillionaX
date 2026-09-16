import { body, param, query } from "express-validator";
import {
  ROLES,
  TIER_VALUES,
  OUTLETS,
  TX_TYPE_VALUES,
  PURCHASE_STATUS_VALUES,
  BILL_STATUS_VALUES,
  CARD_DESIGN_VALUES,
  THEME_PRESET_VALUES,
  FONT_PRESET_VALUES,
  SUPPORT_PARTY_VALUES,
} from "../config/constants.js";

export const objectIdParam = (name) =>
  param(name).isMongoId().withMessage("Invalid id");

export const paginationRules = [
  query("page").optional().isInt({ min: 1 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

/**
 * Query-param filters for the panel tables.
 *
 * `q` is length-capped here as well as escaped in regex.util.js — the cap
 * bounds the work, the escape bounds what the string can mean.
 */
export const searchRule = query("q").optional().isString().trim().isLength({ max: 64 });

export const dateRangeRules = [
  query("from").optional({ values: "falsy" }).isISO8601().toDate(),
  query("to").optional({ values: "falsy" }).isISO8601().toDate(),
];

export const txFilterRules = [
  query("type").optional({ values: "falsy" }).isIn(TX_TYPE_VALUES),
  query("outlet").optional({ values: "falsy" }).isIn(OUTLETS),
  query("hotelId").optional({ values: "falsy" }).isMongoId(),
  query("minCoins").optional({ values: "falsy" }).isInt({ min: 0 }).toInt(),
  query("minBillAmount").optional({ values: "falsy" }).isInt({ min: 0 }).toInt(),
  ...dateRangeRules,
];

/**
 * Filters for the panel's bill history.
 *
 * `status` is checked with a wildcard so it validates whether express parsed
 * one value or several — the history view sends all three terminal states.
 * NOT marked optional for the same reason the content validator records: a
 * wildcard only runs against elements that exist, so an absent param produces
 * zero checks anyway, and marking it optional would let a [null] through.
 */
export const billFilterRules = [
  searchRule,
  query("status").optional({ values: "falsy" }).toArray(),
  query("status.*").isIn(BILL_STATUS_VALUES).withMessage("Unknown bill status"),
  query("outlet").optional({ values: "falsy" }).isIn(OUTLETS),
  ...dateRangeRules,
];

export const memberFilterRules = [
  searchRule,
  query("tier").optional({ values: "falsy" }).isIn(TIER_VALUES),
  query("minBalance").optional({ values: "falsy" }).isInt({ min: 0 }).toInt(),
  query("maxBalance").optional({ values: "falsy" }).isInt({ min: 0 }).toInt(),
  query("joinedFrom").optional({ values: "falsy" }).isISO8601().toDate(),
  query("joinedTo").optional({ values: "falsy" }).isISO8601().toDate(),
];

export const guestFilterRules = [
  searchRule,
  query("hasBalance").optional({ values: "falsy" }).isBoolean().toBoolean(),
  query("joinedFrom").optional({ values: "falsy" }).isISO8601().toDate(),
  query("joinedTo").optional({ values: "falsy" }).isISO8601().toDate(),
];

export const hotelFilterRules = [
  searchRule,
  query("isActive").optional({ values: "falsy" }).isBoolean().toBoolean(),
  query("city").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
  query("lowInventory").optional({ values: "falsy" }).isBoolean().toBoolean(),
];

export const staffFilterRules = [
  query("role").optional({ values: "falsy" }).isIn([ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF]),
  query("isActive").optional({ values: "falsy" }).isBoolean().toBoolean(),
];

export const purchaseFilterRules = [
  query("status").optional({ values: "falsy" }).isIn(PURCHASE_STATUS_VALUES),
  ...dateRangeRules,
];

export const contentFilterRules = [
  query("isActive").optional({ values: "falsy" }).isBoolean().toBoolean(),
  // The three halves of the panel's offer state filter. Orthogonal to
  // isActive: an offer can be hidden AND expired.
  query("currentlyValid").optional({ values: "falsy" }).isBoolean().toBoolean(),
  query("expired").optional({ values: "falsy" }).isBoolean().toBoolean(),
  query("scheduled").optional({ values: "falsy" }).isBoolean().toBoolean(),
];

export const allocateRules = [
  body("phone")
    .customSanitizer((value) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    })
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Enter a valid 10-digit mobile number"),
  body("name").optional().isString().trim().isLength({ max: 80 }),
  body("roomAmount").isInt({ min: 1 }).withMessage("Enter the room amount").toInt(),
  body("nights").isInt({ min: 1, max: 365 }).withMessage("Enter the number of nights").toInt(),
  body("ratePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("idempotencyKey").optional().isString().trim(),
];

/* ---- bills ---- */

/**
 * Composing a bill.
 *
 * Prices are integers in PAISE, matching the Bill model. isInt is doing real
 * work here: a float would carry a fraction of a paisa into the payment path,
 * and a string "1000" would concatenate rather than add when the line total is
 * computed.
 */
export const createBillRules = [
  body("guestId").isMongoId().withMessage("Choose a guest"),
  body("lineItems")
    .isArray({ min: 1, max: 50 })
    .withMessage("Add between 1 and 50 items"),
  body("lineItems.*.description")
    .isString()
    .trim()
    .isLength({ min: 1, max: 120 })
    .withMessage("Every item needs a description"),
  body("lineItems.*.qty")
    .isInt({ min: 1, max: 999 })
    .withMessage("Quantity must be between 1 and 999")
    .toInt(),
  body("lineItems.*.unitPricePaise")
    .isInt({ min: 0 })
    .withMessage("Price must be a whole number of paise")
    .toInt(),
  /**
   * Which hotel service this line was charged to.
   *
   * Deliberately NOT .isIn(...): the valid set is per-hotel now, and a
   * validator cannot see the tenant. The real guard is downstream — a name the
   * hotel does not have finds nothing in the caps map and falls back to the
   * tier cap, which is never more permissive than before services existed.
   */
  body("lineItems.*.service").optional({ values: "falsy" }).isString().trim().isLength({ max: 60 }),
  body("taxPercent").optional({ values: "falsy" }).isFloat({ min: 0, max: 100 }).toFloat(),
  // No bill-level `outlet` rule any more. Every line names its own service, so
  // asking for a second, coarser label meant staff saying the same thing twice
  // — with two answers that could disagree. The QUERY filters above still
  // accept one, because they read bills raised before that changed.
];

/** Guest search on the bill screen. Two characters minimum, capped at 64. */
export const guestSearchRules = [
  query("q")
    .isString()
    .trim()
    .isLength({ min: 2, max: 64 })
    .withMessage("Type at least 2 characters"),
];

/**
 * Starting a payment.
 *
 * coins is optional and defaults to none. It is re-clamped server-side against
 * the balance and the tier cap regardless of what arrives here — this rule only
 * rejects values that are not a coin count at all.
 */
export const payBillRules = [
  body("coins").optional({ values: "falsy" }).isInt({ min: 0 }).toInt(),
  body("providerPaymentId").optional().isString().trim(),
  body("signature").optional().isString().trim(),
];

export const joinHotelRules = [
  body("hotelSlug").optional().isString().trim(),
  body("qrToken").optional().isString().trim(),
];

export const hotelRules = [
  body("name").isString().trim().isLength({ min: 2, max: 120 }).withMessage("Enter the hotel name"),
  body("slug").optional().isString().trim(),
  body("city").optional().isString().trim(),
  body("address").optional().isString().trim(),
  body("phone").optional().isString().trim(),
  body("email").optional().isEmail().normalizeEmail(),
  body("logoUrl").optional().isURL({ protocols: ["http", "https"] }).withMessage("Logo must be an http(s) URL"),
  body("earnRatePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
];

export const hotelUserRules = [
  body("name").isString().trim().isLength({ min: 2, max: 80 }).withMessage("Enter a name"),
  body("email").isEmail().withMessage("Enter a valid email").normalizeEmail(),
  body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("role")
    .optional()
    .isIn([ROLES.HOTEL_ADMIN, ROLES.HOTEL_STAFF])
    .withMessage("Role must be HOTEL_ADMIN or HOTEL_STAFF"),
];

export const sellCoinsRules = [
  body("coins").isInt({ min: 1 }).withMessage("Enter the number of coins").toInt(),
  body("amountPaid").isInt({ min: 0 }).withMessage("Enter the amount paid").toInt(),
  body("paymentRef").optional().isString().trim(),
  body("note").optional().isString().trim().isLength({ max: 500 }),
];

export const contentRules = [
  body("title").isString().trim().isLength({ min: 2, max: 140 }).withMessage("Enter a title"),
  body("description").optional().isString().trim().isLength({ max: 2000 }),
  body("imageUrl")
    .optional({ values: "falsy" })
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Image must be an http(s) URL"),
  body("outlet").optional().isString().trim(),
  body("isActive").optional().isBoolean().toBoolean(),
  body("sortOrder").optional().isInt().toInt(),
  body("validFrom").optional({ values: "falsy" }).isISO8601().toDate(),
  body("validTo").optional({ values: "falsy" }).isISO8601().toDate(),
  body("videoUrl")
    .optional({ values: "falsy" })
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Video must be an http(s) URL"),
  body("duration").optional({ values: "falsy" }).isString().trim().isLength({ max: 12 }),
];

/**
 * Offers: a dated, tier-targeted promotion.
 *
 * Every rule is optional so one chain serves POST and PATCH alike — the
 * model's `required: true` on title is what enforces it at creation. That
 * matters more here than elsewhere: `validTo` now DRIVES DELETION, so the
 * PATCH route must validate it rather than accepting whatever arrives.
 */
export const offerRules = [
  body("title").optional().isString().trim().isLength({ min: 2, max: 140 }).withMessage("Enter a title"),
  body("description").optional().isString().trim().isLength({ max: 2000 }),
  body("discountLabel")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 24 })
    .withMessage("Keep the discount under 24 characters"),
  body("terms").optional({ values: "falsy" }).isString().trim().isLength({ max: 1000 }),
  body("howToRedeem").optional({ values: "falsy" }).isString().trim().isLength({ max: 300 }),
  body("imageUrl")
    .optional({ values: "falsy" })
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Image must be an http(s) URL"),
  body("outlet").optional().isString().trim(),
  body("isActive").optional().isBoolean().toBoolean(),
  body("sortOrder").optional().isInt().toInt(),
  body("validFrom").optional({ values: "falsy" }).isISO8601().toDate(),
  // Declared on validTo rather than validFrom so the message lands on the
  // field the manager has to move. The chain runs in array order, so
  // req.body.validFrom has already been through its own .toDate() by here.
  body("validTo")
    .optional({ values: "falsy" })
    .isISO8601()
    .toDate()
    .custom((validTo, { req }) => {
      const from = req.body.validFrom;
      if (from && new Date(validTo) <= new Date(from)) {
        throw new Error("The deadline must be after the start date");
      }
      return true;
    }),
  body("tiers")
    .optional()
    .isArray({ max: TIER_VALUES.length })
    .withMessage("Choose which tiers this offer is for"),
  // Deliberately NOT .optional() — see privilegeRules below for why.
  body("tiers.*").isIn(TIER_VALUES).withMessage("Unknown tier"),
];

/**
 * Privileges reuse the Content shape, plus a short value label and an optional
 * tier target.
 *
 * Every rule is optional so the same chain validates POST and PATCH alike —
 * a PATCH of just { isActive: false } must not 422 for a missing title. On
 * create, the model's `required: true` on title is what enforces it.
 */
export const privilegeRules = [
  body("title").optional().isString().trim().isLength({ min: 2, max: 140 }).withMessage("Enter a title"),
  body("description").optional().isString().trim().isLength({ max: 2000 }),
  body("valueLabel")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 40 })
    .withMessage("Keep the value under 40 characters"),
  body("imageUrl")
    .optional({ values: "falsy" })
    .isURL({ protocols: ["http", "https"] })
    .withMessage("Image must be an http(s) URL"),
  body("outlet").optional().isString().trim(),
  body("isActive").optional().isBoolean().toBoolean(),
  body("sortOrder").optional().isInt().toInt(),
  body("tiers").optional().isArray({ max: TIER_VALUES.length }).withMessage("Choose which tiers this applies to"),
  // Deliberately NOT .optional(): a wildcard only runs against elements that
  // exist, so an absent or empty array already produces zero checks. Marking
  // it optional would let a [null] element through.
  body("tiers.*").isIn(TIER_VALUES).withMessage("Unknown tier"),
];

/**
 * A hotel's billable service and its per-tier coin caps.
 *
 * Every rule optional so one chain serves POST and PATCH alike — on create the
 * model's `required: true` on name is what enforces it.
 *
 * NOTE each cap is `.optional()` and NOT `.optional({ values: "falsy" })`. The
 * falsy form would discard a posted 0, and 0 is the value that means "coins are
 * not accepted here" — the whole point of the field.
 */
export const serviceRules = [
  body("name")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage("Name the service"),
  ...TIER_VALUES.map((tier) =>
    body(`coinCaps.${tier}`)
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage("Between 0 and 100")
      .toFloat()
  ),
  body("isActive").optional().isBoolean().toBoolean(),
  body("sortOrder").optional().isInt({ min: 0 }).toInt(),
];

/** A guest's comment on a video. Plain text, always rendered as text. */
export const commentRules = [
  body("body")
    .isString()
    .trim()
    .isLength({ min: 1, max: 600 })
    .withMessage("Write something first (600 characters max)"),
  // Present only on a reply. `values: "falsy"` so the composer may post
  // parentId: null for a top-level comment without tripping the id check.
  body("parentId").optional({ values: "falsy" }).isMongoId().withMessage("Invalid comment id"),
];

/**
 * A feed post: one to ten images, and an optional caption.
 *
 * Shape only. Whether those URLs are ones we actually host is a SECURITY
 * question and is answered by assertOwnImages in feed.service.js — the browser
 * uploads directly to Cloudinary, so the URL we are handed back is
 * client-supplied and cannot be trusted from its shape alone.
 */
export const feedPostRules = [
  body("images")
    .isArray({ min: 1, max: 10 })
    .withMessage("Add between 1 and 10 images"),
  // A wildcard, matching the tiers.* pattern above: it only runs against
  // elements that exist, so an absent array produces zero element checks and
  // the isArray rule is what reports the real problem. Not marked optional, or
  // a [null] element would slip through.
  body("images.*")
    .isString()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage("Invalid image"),
  body("caption").optional({ values: "falsy" }).isString().trim().isLength({ max: 2200 }),
];

/** Editing a post. The caption is the only mutable field — see feedPost.model.js. */
export const feedCaptionRules = [
  body("caption")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 2200 })
    .withMessage("A caption is 2200 characters at most"),
];

export const settingsRules = [
  body("welcomeCredit").optional().isInt({ min: 0 }).toInt(),
  body("defaultEarnRatePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("platformFeePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("redemptionRebatePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("voucherTtlMinutes").optional().isInt({ min: 1, max: 120 }).toInt(),
  body("settlementDays").optional().isInt({ min: 0, max: 60 }).toInt(),
  body("coinValuePaise").optional().isInt({ min: 1 }).toInt(),
  body("tierCaps.SILVER").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("tierCaps.GOLD").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("tierCaps.PLATINUM").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  // Rejected rather than silently defaulted: a typo'd key would otherwise
  // change every guest's card to the fallback with no error shown.
  body("cardDesign")
    .optional()
    .isIn(CARD_DESIGN_VALUES)
    .withMessage("Unknown card design"),
  body("themePreset")
    .optional()
    .isIn(THEME_PRESET_VALUES)
    .withMessage("Unknown theme"),
  body("fontPreset")
    .optional()
    .isIn(FONT_PRESET_VALUES)
    .withMessage("Unknown font"),
  // Strict hex only: the value is interpolated into a CSS custom property on
  // every dashboard, so anything else is refused rather than sanitised.
  body("themeCustomColor")
    .optional()
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage("Enter a 6-digit hex colour"),
  // toBoolean() would turn a typo'd "yes" into false and silently hide the
  // feed, so the value has to already BE a boolean to be accepted.
  body("feedEnabled").optional().isBoolean({ strict: true }),
];

/**
 * A support message, from either side.
 *
 * The 2000-character cap matches the model's maxlength — enforced in both
 * places so an oversized body is a 400 with a field error rather than a
 * mongoose ValidationError surfacing as a 500.
 */
/**
 * Which support channel a request is about.
 *
 * Defaults to the guest queue when absent, so the guest-inbox calls that
 * predate the hotel channel keep working. Checked against the enum rather than
 * coerced — an unknown party would otherwise match no rows and look like an
 * empty inbox rather than a bad request.
 */
export const supportPartyRule = [
  query("party").optional({ values: "falsy" }).isIn(SUPPORT_PARTY_VALUES),
  body("party").optional({ values: "falsy" }).isIn(SUPPORT_PARTY_VALUES),
];

export const supportMessageRules = [
  body("body")
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("A message is 1 to 2000 characters"),
];

/**
 * Indian mobile: exactly 10 digits starting 6-9, optionally +91 prefixed.
 * Normalised to the bare 10 digits so one guest cannot end up with two
 * accounts by typing "+91 98765 43210" one day and "9876543210" the next.
 */
export const phoneRule = (field = "phone") =>
  body(field)
    .customSanitizer((value) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    })
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Enter a valid 10-digit mobile number");

export const buyCoinsRules = [
  body("packId").optional().isString().trim(),
  body("coins").optional().isInt({ min: 1 }).toInt(),
  body("price").optional().isInt({ min: 0 }).toInt(),
  body("paymentMethod").optional().isIn(["card", "upi", "netbanking"]),
];

export const creditMemberRules = [
  body("coins").isInt({ min: 1 }).withMessage("Enter how many coins to add").toInt(),
  body("note").optional().isString().trim().isLength({ max: 200 }),
  body("idempotencyKey").optional().isString().trim(),
];

/** Guests editing their own profile. Hotels no longer edit member details. */
/**
 * Month-wise redemption reporting. Every field optional: with none supplied the
 * service returns its default trailing window.
 */
export const monthlyReportRules = [
  query("hotelId").optional({ values: "falsy" }).isMongoId(),
  query("months").optional({ values: "falsy" }).isInt({ min: 1, max: 60 }).toInt(),
  ...dateRangeRules,
];

/**
 * Triggering the month-end rebate by hand.
 *
 * `period` is validated against the same YYYY-MM shape the settlement model
 * stores, so a malformed month is refused here rather than reaching the
 * aggregation and quietly matching nothing.
 */
export const runRebateRules = [
  body("period")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage('Period must look like "2026-08"'),
  body("hotelId").optional({ values: "falsy" }).isMongoId(),
  body("dryRun").optional().isBoolean().toBoolean(),
];

export const memberDetailsRules = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 80 }),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid email").normalizeEmail(),
  // Linking a mobile number. Sanitised to the bare 10 digits exactly as the
  // login rule does, so "+91 98765 43210" matches the account staff created by
  // typing "9876543210" — the whole point of the merge.
  body("phone")
    .optional({ values: "falsy" })
    .customSanitizer((value) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    })
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Enter a valid 10-digit mobile number"),
  // Shape only. That it belongs to OUR Cloudinary account is enforced in the
  // service, which is the check that actually matters.
  body("avatarUrl")
    .optional({ values: "null" })
    .isString()
    .trim()
    .isLength({ max: 500 }),
];

export const recordStayRules = [
  body("nights").isInt({ min: 1, max: 365 }).withMessage("Enter the number of nights").toInt(),
  body("amount").isInt({ min: 1 }).withMessage("Enter the total amount for the stay").toInt(),
  body("note").optional().isString().trim().isLength({ max: 200 }),
  body("idempotencyKey").optional().isString().trim(),
];

/**
 * Hotel settings, including this hotel's own tier rules.
 *
 * Platinum must sit above Gold: with the bars inverted, resolveTierByNights
 * would hand out Platinum before Gold was ever reachable.
 */
export const hotelSettingsRules = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 120 }),
  body("city").optional().isString().trim().isLength({ max: 80 }),
  body("address").optional().isString().trim().isLength({ max: 300 }),
  body("phone").optional().isString().trim().isLength({ max: 20 }),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid email").normalizeEmail(),
  body("earnRatePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  // Shape only — that it is on OUR Cloudinary account is enforced in the
  // service, which is the check that actually matters.
  body("logoUrl").optional({ values: "null" }).isString().trim().isLength({ max: 500 }),

  body("tierNightThresholds.GOLD")
    .optional()
    .isInt({ min: 1, max: 3650 })
    .withMessage("Gold nights must be at least 1")
    .toInt(),
  body("tierNightThresholds.PLATINUM")
    .optional()
    .isInt({ min: 1, max: 3650 })
    .withMessage("Platinum nights must be at least 1")
    .toInt()
    .custom((platinum, { req }) => {
      const gold = req.body?.tierNightThresholds?.GOLD;
      if (gold != null && Number(platinum) <= Number(gold)) {
        throw new Error("Platinum must need more nights than Gold");
      }
      return true;
    }),

  body("tierEarnRates.SILVER").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("tierEarnRates.GOLD").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("tierEarnRates.PLATINUM").optional().isFloat({ min: 0, max: 100 }).toFloat(),
];

export const adminUserRules = [
  body("name").isString().trim().isLength({ min: 2, max: 80 }).withMessage("Enter a name"),
  body("email").isEmail().withMessage("Enter a valid email").normalizeEmail(),
  body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
];

export const adminUpdateRules = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 80 }),
  body("email").optional().isEmail().withMessage("Enter a valid email").normalizeEmail(),
  body("password")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
  body("isActive").optional().isBoolean().toBoolean(),
];

export const guestUpdateRules = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 80 }),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid email").normalizeEmail(),
  body("phone")
    .optional()
    .customSanitizer((value) => {
      const digits = String(value || "").replace(/\D/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    })
    .matches(/^[6-9]\d{9}$/)
    .withMessage("Enter a valid 10-digit mobile number"),
  body("isActive").optional().isBoolean().toBoolean(),
];

export const tierValues = TIER_VALUES;

/**
 * Razorpay credentials from the admin panel.
 *
 * Every field is optional because this is a PATCH: an admin replacing only the
 * webhook secret must not have to re-enter the key secret, and requiring it
 * would mean the secret travelling to the browser first so the form could
 * pre-fill it — exactly what must never happen.
 */
export const paymentSettingsRules = [
  body("keyId").optional({ values: "falsy" }).isString().trim().isLength({ max: 80 }),
  body("keySecret").optional({ values: "falsy" }).isString().trim().isLength({ max: 200 }),
  body("webhookSecret").optional({ values: "falsy" }).isString().trim().isLength({ max: 200 }),
  body("routeEnabled").optional().isBoolean().toBoolean(),
  body("transferHoldHours").optional({ values: "falsy" }).isInt({ min: 0, max: 720 }).toInt(),
];

/* ---- hotel onboarding ---- */

/**
 * KYC details. Everything optional because the form saves as it is filled in —
 * an admin gathering documents over a phone call should not lose what they
 * already typed. The checks that actually gate activation live in
 * onboarding.service.js, where the whole record can be judged at once.
 */
export const onboardingRules = [
  body("business.legalName").optional({ values: "falsy" }).isString().trim().isLength({ max: 160 }),
  body("business.type").optional({ values: "falsy" }).isString().trim().isLength({ max: 60 }),
  body("business.pan")
    .optional({ values: "falsy" })
    .matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/)
    .withMessage("Enter a valid 10-character PAN"),
  body("business.gstin")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ min: 15, max: 15 })
    .withMessage("A GSTIN is 15 characters"),
  body("business.registeredAddress").optional({ values: "falsy" }).isString().trim(),
  body("business.city").optional({ values: "falsy" }).isString().trim(),
  body("business.state").optional({ values: "falsy" }).isString().trim(),
  body("business.pincode")
    .optional({ values: "falsy" })
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage("Enter a valid 6-digit pincode"),
  body("stakeholder.name").optional({ values: "falsy" }).isString().trim().isLength({ max: 120 }),
  body("stakeholder.pan")
    .optional({ values: "falsy" })
    .matches(/^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/)
    .withMessage("Enter a valid 10-character PAN"),
  body("stakeholder.email").optional({ values: "falsy" }).isEmail().normalizeEmail(),
  body("stakeholder.phone").optional({ values: "falsy" }).isString().trim(),
  body("stakeholder.address").optional({ values: "falsy" }).isString().trim(),
  body("agreement.accepted").optional().isBoolean().toBoolean(),
];

/**
 * The account to penny-drop.
 *
 * Required here, unlike the KYC fields: there is nothing to verify without
 * them, and the IFSC shape is worth catching before a network call.
 */
export const bankVerificationRules = [
  body("accountNumber")
    .isString()
    .trim()
    .isLength({ min: 5, max: 24 })
    .withMessage("Enter the account number"),
  body("ifsc")
    .matches(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/)
    .withMessage("Enter a valid 11-character IFSC"),
  body("beneficiaryName")
    .isString()
    .trim()
    .isLength({ min: 2, max: 160 })
    .withMessage("Enter the account holder's name"),
];
