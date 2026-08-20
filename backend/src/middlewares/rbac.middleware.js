import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(new ApiError(401, "Authentication required"));
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, "You do not have permission to perform this action"));
    }
    next();
  };

/**
 * Confines hotel staff to their own hotel. Applied at router level so a newly
 * added route is protected by default — one route missing this would leak
 * another hotel's financial data.
 *
 * Resolves the effective hotelId onto req.hotelId for downstream handlers.
 */
export const requireSameHotel = (req, res, next) => {
  if (!req.user) return next(new ApiError(401, "Authentication required"));

  // Main admin operates across all hotels; it must pass an explicit target.
  if (req.user.role === ROLES.MAIN_ADMIN) {
    req.hotelId = req.params.hotelId || req.body?.hotelId || req.query?.hotelId || null;
    return next();
  }

  if (!req.user.hotelId) {
    return next(new ApiError(403, "This account is not linked to a hotel"));
  }

  const requested = req.params.hotelId || req.body?.hotelId || req.query?.hotelId;
  if (requested && String(requested) !== String(req.user.hotelId)) {
    return next(new ApiError(403, "You cannot access another hotel's data"));
  }

  // Always trust the token's hotelId, never a client-supplied one.
  req.hotelId = req.user.hotelId;
  next();
};
