import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/token.util.js";
import { User } from "../models/user.model.js";

/** Requires a valid access token and loads the user onto req.user. */
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) throw new ApiError(401, "Authentication required");

  const payload = verifyAccessToken(token);
  const user = await User.findById(payload.sub);

  if (!user) throw new ApiError(401, "Account no longer exists");
  if (!user.isActive) throw new ApiError(403, "This account has been deactivated");

  req.user = user;
  next();
});
