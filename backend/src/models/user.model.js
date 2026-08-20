import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ROLES, ROLE_VALUES } from "../config/constants.js";

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ROLE_VALUES, required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },

    // Guests are identified by phone; staff/admins by email. Never both.
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    passwordHash: { type: String, select: false },

    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", default: null, index: true },

    // Cloudinary delivery URL. Validated on write against our own account —
    // see isOwnCloudinaryUrl — so it can never point at an arbitrary host.
    avatarUrl: { type: String, trim: true },

    // The welcome credit is granted once per person across the whole platform,
    // so the flag lives on the user rather than on a per-hotel membership.
    welcomeCreditClaimed: { type: Boolean, default: false },

    // The seeded superadmin. Cannot be edited, deactivated or deleted by
    // anyone, so the platform can never be locked out of its own admin panel.
    isProtected: { type: Boolean, default: false },

    refreshTokens: { type: [String], default: [], select: false },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

// Partial (not sparse) unique indexes: `sparse` still collides when the field is
// explicitly null, which happens easily. `$type: "string"` only indexes real values.
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: "string" } } }
);
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);
userSchema.index({ hotelId: 1, role: 1 });

userSchema.pre("save", async function hashPassword(next) {
  if (!this.isModified("passwordHash") || !this.passwordHash) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id,
    role: this.role,
    name: this.name,
    phone: this.phone,
    email: this.email,
    avatarUrl: this.avatarUrl,
    hotelId: this.hotelId,
    isActive: this.isActive,
    isProtected: this.isProtected,
  };
};

userSchema.statics.ROLES = ROLES;

export const User = mongoose.model("User", userSchema);
