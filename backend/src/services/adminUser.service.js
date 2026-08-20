import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";
import { User } from "../models/user.model.js";
import { Hotel } from "../models/hotel.model.js";
import { GuestHotelMembership } from "../models/guestHotelMembership.model.js";
import { CoinTransaction } from "../models/coinTransaction.model.js";
import { Voucher } from "../models/voucher.model.js";
import { Content } from "../models/content.model.js";
import { CoinPurchase } from "../models/coinPurchase.model.js";

/**
 * Loads a user and refuses if they are the protected superadmin.
 * Every mutating admin path funnels through here, so the platform can never be
 * locked out of its own admin panel.
 */
const loadMutableUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "Account not found");
  if (user.isProtected) {
    throw new ApiError(403, "The primary superadmin account cannot be modified or removed");
  }
  return user;
};

// ---------------- platform admins ----------------

/** Returns { admins, total, page, limit } — bespoke key kept deliberately. */
export const listAdmins = async ({ isActive, page = 1, limit = 25 } = {}) => {
  const filter = { role: ROLES.MAIN_ADMIN };
  if (isActive != null) filter.isActive = isActive;

  const skip = (page - 1) * limit;

  const [admins, total] = await Promise.all([
    User.find(filter)
      .select("name email isActive isProtected lastLoginAt createdAt")
      // The protected superadmin always sorts first — it is the account that
      // cannot be removed, so it reads as the anchor of the list.
      .sort({ isProtected: -1, createdAt: 1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { admins, total, page, limit };
};

export const createAdmin = async ({ name, email, password }) => {
  const normalized = String(email).toLowerCase();
  if (await User.exists({ email: normalized })) {
    throw new ApiError(409, "An account with this email already exists");
  }

  const user = await User.create({
    role: ROLES.MAIN_ADMIN,
    name,
    email: normalized,
    passwordHash: password,
  });

  return user.toSafeObject();
};

export const updateAdmin = async ({ userId, name, email, password, isActive }) => {
  const user = await loadMutableUser(userId);
  if (user.role !== ROLES.MAIN_ADMIN) throw new ApiError(400, "That account is not an admin");

  if (email && email.toLowerCase() !== user.email) {
    const normalized = email.toLowerCase();
    if (await User.exists({ email: normalized, _id: { $ne: user._id } })) {
      throw new ApiError(409, "An account with this email already exists");
    }
    user.email = normalized;
  }

  if (name) user.name = name;
  if (typeof isActive === "boolean") user.isActive = isActive;
  // Assigning triggers the pre-save hook, which hashes it.
  if (password) user.passwordHash = password;

  await user.save();
  return user.toSafeObject();
};

export const deleteAdmin = async ({ userId, actingUserId }) => {
  // Protection is checked FIRST: "the superadmin is protected" is the more
  // accurate answer than "you cannot delete yourself" when they are the same
  // account, and it stays correct when a different admin attempts it.
  const user = await loadMutableUser(userId);
  if (user.role !== ROLES.MAIN_ADMIN) throw new ApiError(400, "That account is not an admin");

  if (String(userId) === String(actingUserId)) {
    throw new ApiError(400, "You cannot delete your own account");
  }

  await User.deleteOne({ _id: user._id });
  return { id: user._id };
};

// ---------------- guests (read / update / delete) ----------------

export const getGuest = async (guestId) => {
  const guest = await User.findOne({ _id: guestId, role: ROLES.GUEST });
  if (!guest) throw new ApiError(404, "Guest not found");

  const memberships = await GuestHotelMembership.find({ guestId }).populate(
    "hotelId",
    "name slug city"
  );
  const transactions = await CoinTransaction.find({ guestId })
    .populate("hotelId", "name")
    .sort({ createdAt: -1 })
    .limit(25);

  return { guest: guest.toSafeObject(), memberships, transactions };
};

export const updateGuest = async ({ guestId, name, email, phone, isActive }) => {
  const guest = await User.findOne({ _id: guestId, role: ROLES.GUEST });
  if (!guest) throw new ApiError(404, "Guest not found");

  if (phone && phone !== guest.phone) {
    if (await User.exists({ phone, _id: { $ne: guest._id } })) {
      throw new ApiError(409, "Another guest already uses this phone number");
    }
    guest.phone = phone;
  }

  if (name) guest.name = name;
  if (email !== undefined) guest.email = email || undefined;
  if (typeof isActive === "boolean") guest.isActive = isActive;

  await guest.save();
  return guest.toSafeObject();
};

/**
 * Removes a guest and everything derived from them.
 *
 * Refuses while they still hold coins: those are a real liability a hotel has
 * already funded, and deleting would silently write them off. Zero the balance
 * with an adjustment first if the removal is genuinely intended.
 */
export const deleteGuest = async (guestId) => {
  const guest = await User.findOne({ _id: guestId, role: ROLES.GUEST });
  if (!guest) throw new ApiError(404, "Guest not found");

  const memberships = await GuestHotelMembership.find({ guestId });
  const outstanding = memberships.reduce((sum, m) => sum + m.balance, 0);

  if (outstanding > 0) {
    throw new ApiError(
      409,
      `This guest still holds ${outstanding.toLocaleString("en-IN")} coins. ` +
        `Zero their balance before deleting the account.`
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Voucher.deleteMany({ guestId }, { session });
      await GuestHotelMembership.deleteMany({ guestId }, { session });
      // The ledger is kept: it is the audit trail for coins hotels paid for.
      await User.deleteOne({ _id: guestId }, { session });
    });
  } finally {
    await session.endSession();
  }

  return { id: guestId };
};

// ---------------- hotels (delete) ----------------

/**
 * Removes a hotel and its dependents. Refuses while guests still hold coins
 * there, for the same reason as deleteGuest.
 */
export const deleteHotel = async (hotelId) => {
  const hotel = await Hotel.findById(hotelId);
  if (!hotel) throw new ApiError(404, "Hotel not found");

  const memberships = await GuestHotelMembership.find({ hotelId });
  const outstanding = memberships.reduce((sum, m) => sum + m.balance, 0);

  if (outstanding > 0) {
    throw new ApiError(
      409,
      `Guests still hold ${outstanding.toLocaleString("en-IN")} coins at this hotel. ` +
        `Deactivate it instead, or clear the balances first.`
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Voucher.deleteMany({ hotelId }, { session });
      await GuestHotelMembership.deleteMany({ hotelId }, { session });
      await Content.deleteMany({ hotelId }, { session });
      await CoinPurchase.deleteMany({ hotelId }, { session });
      // Staff accounts belong to the hotel and have no meaning without it.
      await User.deleteMany({ hotelId }, { session });
      await Hotel.deleteOne({ _id: hotelId }, { session });
    });
  } finally {
    await session.endSession();
  }

  return { id: hotelId };
};
