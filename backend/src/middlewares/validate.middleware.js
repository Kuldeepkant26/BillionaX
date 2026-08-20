import { validationResult } from "express-validator";
import { ApiError } from "../utils/ApiError.js";

/**
 * Runs after a validator chain. Collects field errors into ApiError.details so
 * the frontend can show them inline rather than as one generic banner.
 */
export const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
  }));

  next(new ApiError(422, "Validation failed", details));
};
