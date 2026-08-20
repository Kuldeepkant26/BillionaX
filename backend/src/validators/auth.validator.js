import { body } from "express-validator";
import { phoneRule } from "./common.validator.js";

export const staffLoginRules = [
  body("email").isEmail().withMessage("Enter a valid email address").normalizeEmail(),
  body("password").isString().isLength({ min: 1 }).withMessage("Password is required"),
];

export const requestOtpRules = [phoneRule()];

export const verifyOtpRules = [
  phoneRule(),
  body("otp").isString().trim().notEmpty().withMessage("Enter the verification code"),
  body("name").optional().isString().trim().isLength({ max: 80 }),
  body("hotelSlug").optional().isString().trim(),
  body("qrToken").optional().isString().trim(),
];
