import { body, param, query } from "express-validator";
import {
  ROLES,
  TIER_VALUES,
  OUTLETS,
  TX_TYPE_VALUES,
  PURCHASE_STATUS_VALUES,
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
  query("currentlyValid").optional({ values: "falsy" }).isBoolean().toBoolean(),
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

export const verifyVoucherRules = [
  body("code").isString().trim().notEmpty().withMessage("Enter the guest's code"),
  body("billAmount").optional().isInt({ min: 0 }).toInt(),
];

export const redeemVoucherRules = [
  body("code").isString().trim().notEmpty().withMessage("Enter the guest's code"),
  body("billAmount").isInt({ min: 1 }).withMessage("Enter the bill amount").toInt(),
  body("outlet").optional().isIn(OUTLETS).withMessage("Choose a valid outlet"),
  body("idempotencyKey").optional().isString().trim(),
];

export const createVoucherRules = [
  body("hotelId").isMongoId().withMessage("Choose a hotel"),
  body("coins").isInt({ min: 1 }).withMessage("Enter how many coins to use").toInt(),
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

export const settingsRules = [
  body("welcomeCredit").optional().isInt({ min: 0 }).toInt(),
  body("defaultEarnRatePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("platformFeePercent").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("voucherTtlMinutes").optional().isInt({ min: 1, max: 120 }).toInt(),
  body("settlementDays").optional().isInt({ min: 0, max: 60 }).toInt(),
  body("coinValuePaise").optional().isInt({ min: 1 }).toInt(),
  body("tierCaps.SILVER").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("tierCaps.GOLD").optional().isFloat({ min: 0, max: 100 }).toFloat(),
  body("tierCaps.PLATINUM").optional().isFloat({ min: 0, max: 100 }).toFloat(),
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
export const memberDetailsRules = [
  body("name").optional().isString().trim().isLength({ min: 2, max: 80 }),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid email").normalizeEmail(),
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
