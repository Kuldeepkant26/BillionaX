import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { protect } from "../middlewares/auth.middleware.js";
import { authLimiter, otpLimiter } from "../middlewares/rateLimiter.middleware.js";
import {
  staffLoginRules,
  requestOtpRules,
  verifyOtpRules,
} from "../validators/auth.validator.js";

const router = Router();

router.post("/staff/login", authLimiter, staffLoginRules, validate, authController.staffLogin);

router.post("/guest/request-otp", otpLimiter, requestOtpRules, validate, authController.guestRequestOtp);
router.post("/guest/verify-otp", authLimiter, verifyOtpRules, validate, authController.guestVerifyOtp);

router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", protect, authController.logout);
router.get("/me", protect, authController.me);

export default router;
