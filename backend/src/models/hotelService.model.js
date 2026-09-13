import mongoose from "mongoose";
import { TIERS } from "../config/constants.js";

/**
 * A billable service at one hotel — Restaurant, Spa, Laundry — and the share of
 * a line charged to it that coins may cover, per membership tier.
 *
 * REPLACES Hotel.tierCaps rather than stacking with it. A hotel setting
 * "Restaurant, Gold 25%" is making a commercial decision about that outlet for
 * that tier, and quietly intersecting it with a second platform-level cap would
 * make the number in the panel a lie. Hotel.tierCaps survives as the fallback
 * for a line with NO service tagged, and for every bill raised before services
 * existed.
 *
 * `name` is the join key with Bill.lineItems[].service, which stores the NAME
 * as a string rather than an ObjectId. That is deliberate: a bill is a receipt,
 * and a receipt that renders differently after somebody renames or deletes an
 * outlet is not a receipt. It also keeps every existing outlet filter and
 * report working without a migration. The cost is that names are identity:
 *
 *   - DELETING a service leaves past bills untouched — they carry the name and
 *     their own frozen allowance. New bills naming it fall back to the tier cap.
 *   - RENAMING is not cascaded onto bills, for the receipt reason above, so
 *     history keeps the old name. Deactivate and create is the clean path.
 */
const hotelServiceSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 60 },

    /**
     * Share of a line charged to this service that coins may cover, by the
     * guest's tier. 0-100 each.
     *
     * 0 IS A MEANINGFUL VALUE, not "unset" — it is how a hotel says "coins are
     * not accepted at the spa". Nothing anywhere may coalesce it to a default:
     * `coinCaps[tier] || fallback` is the one bug that would quietly hand a
     * guest the full tier allowance on a service that accepts none. Every read
     * of these uses `??` and an explicit null check.
     *
     * Shaped like Hotel.tierCaps deliberately, so the two read the same way at
     * every call site that has to choose between them.
     *
     * Each is `required` with a default, so a tier can never be missing at read
     * time — resolveServiceCaps would otherwise have to decide what an absent
     * Gold rate means, and "absent" and "zero" are exactly the two things this
     * feature must never confuse.
     */
    coinCaps: {
      [TIERS.SILVER]: { type: Number, required: true, default: 0, min: 0, max: 100 },
      [TIERS.GOLD]: { type: Number, required: true, default: 0, min: 0, max: 100 },
      [TIERS.PLATINUM]: { type: Number, required: true, default: 0, min: 0, max: 100 },
    },

    // Hiding is the safe alternative to deleting: nothing new can be billed to
    // it, but a line already naming it still prices at the rate the hotel set.
    isActive: { type: Boolean, default: true, index: true },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/**
 * One service per name per hotel, case-insensitively.
 *
 * Load-bearing rather than cosmetic: resolveServiceCaps builds a name -> caps
 * Map, and two rows both named "Spa" would make a bill's allowance depend on
 * which one Mongo happened to return first.
 */
hotelServiceSchema.index(
  { hotelId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

// The billing screen's only query: this hotel's live services, in panel order.
hotelServiceSchema.index({ hotelId: 1, isActive: 1, sortOrder: 1 });

export const HotelService = mongoose.model("HotelService", hotelServiceSchema);
