import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { HotelService } from "../models/hotelService.model.js";

/**
 * A hotel's billable services and the coin cap on each.
 *
 * CRUD follows content.service.js, including the two rules that matter there:
 * the update strips the keys that identify the row so a patch can never move it
 * between hotels, and every read and write is filtered by hotelId so the filter
 * itself is the authorisation.
 */

/** Case-insensitive matching, to agree with the unique index's collation. */
const CASE_INSENSITIVE = { locale: "en", strength: 2 };

export const listHotelServices = async ({ hotelId, isActive, page = 1, limit = 100 }) => {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 100));
  const safePage = Math.max(1, Number(page) || 1);

  const filter = { hotelId };
  if (isActive !== undefined && isActive !== "") filter.isActive = isActive;

  const sort = { sortOrder: 1, name: 1 };
  const skip = (safePage - 1) * safeLimit;

  const [items, total] = await Promise.all([
    HotelService.find(filter).sort(sort).skip(skip).limit(safeLimit).lean(),
    HotelService.countDocuments(filter),
  ]);

  return { items, total, page: safePage, limit: safeLimit };
};

/**
 * Refuses a name another service at this hotel already holds.
 *
 * The unique index is the real guard; this exists so the answer is a 409 naming
 * the field rather than a raw E11000 surfacing as a 500. The collation is not
 * optional — without it this check misses "spa" against "Spa" and the index
 * throws anyway.
 */
const assertNameFree = async ({ hotelId, name, exceptId = null }) => {
  const clash = await HotelService.findOne({
    hotelId,
    name,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  })
    .collation(CASE_INSENSITIVE)
    .select("_id")
    .lean();

  if (clash) {
    throw new ApiError(409, "A service with that name already exists", [
      { field: "name", message: "Already in use" },
    ]);
  }
};

export const createHotelService = async ({ hotelId, name, ...payload }) => {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    throw new ApiError(400, "Name the service", [{ field: "name", message: "Name the service" }]);
  }

  await assertNameFree({ hotelId, name: trimmed });

  // Sorted to the end by default, so a new service does not displace the order
  // a manager has already arranged.
  const last = await HotelService.findOne({ hotelId }).sort({ sortOrder: -1 }).select("sortOrder").lean();

  return HotelService.create({
    ...payload,
    hotelId,
    name: trimmed,
    sortOrder: payload.sortOrder ?? (last?.sortOrder ?? -1) + 1,
  });
};

export const updateHotelService = async ({ id, hotelId, patch }) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "Service not found");

  // hotelId and _id are set once, at creation. Left in the patch a client could
  // hand this service to another hotel outright — the filter below scopes which
  // document is FOUND, not what the update is allowed to write.
  const { hotelId: _hotelId, _id, ...safePatch } = patch;

  if (safePatch.name !== undefined) {
    safePatch.name = String(safePatch.name).trim();
    if (!safePatch.name) {
      throw new ApiError(400, "Name the service", [{ field: "name", message: "Name the service" }]);
    }
    await assertNameFree({ hotelId, name: safePatch.name, exceptId: id });
  }

  const service = await HotelService.findOneAndUpdate({ _id: id, hotelId }, safePatch, {
    new: true,
    runValidators: true,
  });

  if (!service) throw new ApiError(404, "Service not found");
  return service;
};

export const deleteHotelService = async ({ id, hotelId }) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, "Service not found");

  // Bills already raised keep the NAME they were sent with and their own frozen
  // allowance, so nothing about a settled bill moves when this row goes. New
  // bills naming it simply fall back to the tier cap.
  const service = await HotelService.findOneAndDelete({ _id: id, hotelId });
  if (!service) throw new ApiError(404, "Service not found");
  return service;
};

/**
 * name -> coinCapPercent for one hotel, for resolving a bill's allowance.
 *
 * Lowercased on both sides to match the unique index's collation: staff pick
 * from a dropdown so the case will agree, but a bill posted by an integration
 * must not get a different allowance for "spa" than for "Spa".
 *
 * INACTIVE SERVICES ARE INCLUDED, deliberately. A service hidden mid-shift must
 * still price a line that names it at the rate the hotel set — for a hidden 0%
 * Spa, falling back to the tier cap would jump it from "no coins at all" to the
 * guest's full allowance, which is the opposite of what hiding it meant.
 *
 * An empty Map is a valid answer and the one that keeps this feature safe: a
 * hotel with no service rows has every line fall back to the tier cap, which is
 * exactly the behaviour before services existed.
 */
export const resolveServiceCaps = async (hotelId) => {
  const rows = await HotelService.find({ hotelId }).select("name coinCapPercent").lean();
  return new Map(rows.map((row) => [row.name.trim().toLowerCase(), row.coinCapPercent]));
};
