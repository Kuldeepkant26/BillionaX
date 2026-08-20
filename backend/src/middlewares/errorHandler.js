import mongoose from "mongoose";
import { isProduction } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { ApiError } from "../utils/ApiError.js";

export const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found - ${req.originalUrl}`));
};

/**
 * Translates known error shapes (Mongoose, JWT) into ApiError so the response
 * body is consistent regardless of where the failure originated.
 */
const normalize = (err) => {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return new ApiError(422, "Validation failed", details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return new ApiError(400, `Invalid value for '${err.path}'`);
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return new ApiError(409, `A record with this ${field} already exists`, [
      { field, message: "Must be unique" },
    ]);
  }

  if (err?.name === "TokenExpiredError") {
    return new ApiError(401, "Session expired, please sign in again");
  }

  if (err?.name === "JsonWebTokenError") {
    return new ApiError(401, "Invalid authentication token");
  }

  const statusCode = err?.statusCode >= 400 ? err.statusCode : 500;
  return new ApiError(statusCode, err?.message || "Internal Server Error");
};

export const errorHandler = (err, req, res, next) => {
  const error = normalize(err);

  if (error.statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${error.message}`);
    if (!isProduction) console.error(err);
  }

  res.status(error.statusCode).json({
    statusCode: error.statusCode,
    success: false,
    message: isProduction && error.statusCode >= 500 ? "Internal Server Error" : error.message,
    details: error.details || undefined,
    stack: isProduction ? undefined : error.stack,
  });
};
