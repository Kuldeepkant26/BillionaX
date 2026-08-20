import { ApiError } from "../utils/ApiError.js";
import { ROLES, HOTEL_SCOPED_ROLES } from "../config/constants.js";
import { generateRawToken } from "../utils/token.util.js";
import { buildDefaultPrivileges } from "../config/defaultContent.js";
import { destroyAsset, isOwnCloudinaryUrl, publicIdFromUrl } from "./upload.service.js";
import { Hotel } from "../models/hotel.model.js";
import { User } from "../models/user.model.js";
import { Content } from "../models/content.model.js";
import { searchRegex } from "../utils/regex.util.js";
import { logger } from "../utils/logger.js";

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Appends a numeric suffix until the slug is free. */
const uniqueSlug = async (name) => {
  const base = slugify(name) || "hotel";
  let candidate = base;
  let n = 1;
  while (await Hotel.exists({ slug: candidate })) candidate = `${base}-${++n}`;
  return candidate;
};

export const createHotel = async (payload) => {
  const slug = payload.slug ? slugify(payload.slug) : await uniqueSlug(payload.name);

  if (await Hotel.exists({ slug })) {
    throw new ApiError(409, "A hotel with this slug already exists");
  }

  const hotel = await Hotel.create({ ...payload, slug, qrToken: generateRawToken(16) });

  // A hotel with an empty privileges list shows its guests nothing, so it
  // starts with a sensible set it can edit, hide or delete. Non-fatal: the
  // hotel exists either way, and a manager can add these by hand.
  try {
    await Content.insertMany(buildDefaultPrivileges(hotel._id));
  } catch (error) {
    logger.warn(`Default privileges not created for ${hotel.name}: ${error.message}`);
  }

  return hotel;
};

/** Below this, allocations and welcome credits start failing. */
export const LOW_INVENTORY_THRESHOLD = 10000;

export const listHotels = async ({
  q,
  isActive,
  city,
  lowInventory,
  page = 1,
  limit = 25,
}) => {
  const filter = {};

  const rx = searchRegex(q);
  if (rx) filter.$or = [{ name: rx }, { city: rx }, { slug: rx }];
  if (isActive != null) filter.isActive = isActive;
  if (city) filter.city = searchRegex(city);
  if (lowInventory) filter.coinInventory = { $lt: LOW_INVENTORY_THRESHOLD };

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Hotel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Hotel.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

/** Distinct cities, for the admin hotel filter dropdown. */
export const listHotelCities = async () => {
  const cities = await Hotel.distinct("city", { city: { $nin: [null, ""] } });
  return cities.sort((a, b) => a.localeCompare(b));
};

export const getHotelOrFail = async (hotelId) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");
  return hotel;
};

export const updateHotel = async (hotelId, patch) => {
  // Slug and qrToken rotate through dedicated paths, never a generic patch.
  const { slug, qrToken, coinInventory, ...safe } = patch;

  // The logo uploads from the browser, so this URL is client-supplied. Anything
  // not on our own Cloudinary account is refused — otherwise a hotel could
  // point its logo at any host and every guest joining would fetch it.
  let clearLogo = false;

  if (safe.logoUrl !== undefined) {
    if (safe.logoUrl && !isOwnCloudinaryUrl(safe.logoUrl)) {
      throw new ApiError(400, "That image could not be verified", [
        { field: "logoUrl", message: "Unrecognised image source" },
      ]);
    }
    // An empty string means "remove it". Setting the key to undefined would
    // NOT do that — findByIdAndUpdate drops undefined values, so the old logo
    // would survive a removal and silently reappear.
    if (!safe.logoUrl) {
      delete safe.logoUrl;
      clearLogo = true;
    }
  }

  const previous =
    safe.logoUrl !== undefined || clearLogo ? (await Hotel.findById(hotelId))?.logoUrl : null;

  const update = clearLogo ? { $set: safe, $unset: { logoUrl: "" } } : safe;

  const hotel = await Hotel.findByIdAndUpdate(hotelId, update, {
    new: true,
    runValidators: true,
  });
  if (!hotel) throw new ApiError(404, "Hotel not found");

  // Best-effort: an orphaned file costs less than a settings save that fails
  // because a delete timed out.
  if (previous && previous !== hotel.logoUrl) {
    const publicId = publicIdFromUrl(previous);
    if (publicId) destroyAsset(publicId).catch(() => {});
  }

  return hotel;
};

/** Creates a hotel-scoped user (HOTEL_ADMIN or HOTEL_STAFF). */
export const createHotelUser = async ({ hotelId, name, email, password, role }) => {
  if (!HOTEL_SCOPED_ROLES.includes(role)) {
    throw new ApiError(400, "Role must be HOTEL_ADMIN or HOTEL_STAFF");
  }

  await getHotelOrFail(hotelId);

  const normalized = String(email).toLowerCase();
  if (await User.exists({ email: normalized })) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const user = await User.create({
    role,
    name,
    email: normalized,
    passwordHash: password,
    hotelId,
  });

  return user.toSafeObject();
};

/**
 * Returns { staff, total, page, limit }.
 *
 * The bespoke `staff` key is kept rather than renamed to `items`: renaming
 * would break the panel silently if the backend shipped before the frontend,
 * whereas adding the pagination fields is safe in either deploy order.
 */
export const listHotelStaff = async ({ hotelId, role, isActive, page = 1, limit = 25 }) => {
  const filter = { hotelId, role: { $in: HOTEL_SCOPED_ROLES } };
  if (role) filter.role = role;
  if (isActive != null) filter.isActive = isActive;

  const skip = (page - 1) * limit;

  const [staff, total] = await Promise.all([
    User.find(filter)
      .select("name email role isActive lastLoginAt createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { staff, total, page, limit };
};

export const setUserActive = async ({ userId, hotelId, isActive }) => {
  const filter = { _id: userId, role: { $in: HOTEL_SCOPED_ROLES } };
  if (hotelId) filter.hotelId = hotelId;

  const user = await User.findOneAndUpdate(filter, { isActive }, { new: true });
  if (!user) throw new ApiError(404, "Staff member not found");
  return user.toSafeObject();
};

export const rotateQrToken = async (hotelId) => {
  const hotel = await Hotel.findByIdAndUpdate(
    hotelId,
    { qrToken: generateRawToken(16) },
    { new: true }
  ).select("+qrToken");
  if (!hotel) throw new ApiError(404, "Hotel not found");
  return hotel;
};

export const getQrToken = async (hotelId) => {
  const hotel = await Hotel.findById(hotelId).select("+qrToken slug name");
  if (!hotel) throw new ApiError(404, "Hotel not found");
  return { slug: hotel.slug, name: hotel.name, qrToken: hotel.qrToken };
};

export { ROLES };
