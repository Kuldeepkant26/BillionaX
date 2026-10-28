import mongoose from "mongoose";
import { ENQUIRY_STATUS, ENQUIRY_STATUS_VALUES, ENQUIRY_ROOM_BANDS } from "../config/constants.js";

/**
 * A hotel asking to join the network, sent from the public landing page.
 *
 * Its own collection rather than a support thread: the sender has no account
 * yet, and a support conversation is keyed by the user who owns it. This is a
 * lead, not a conversation — the reply happens on the phone.
 *
 * Nothing here is shown to anyone but the main admin, and nothing is derived
 * from it. A row is exactly what the form sent, plus where it stands.
 */
const partnerEnquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    hotelName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    rooms: { type: String, enum: [...ENQUIRY_ROOM_BANDS, null], default: null },
    message: { type: String, trim: true, maxlength: 1000, default: "" },

    status: {
      type: String,
      enum: ENQUIRY_STATUS_VALUES,
      default: ENQUIRY_STATUS.NEW,
      index: true,
    },
    // Who last moved it, and when — so two admins working the same inbox can
    // see that a lead has already been picked up.
    statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    statusChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The inbox reads newest first, optionally narrowed to one status.
partnerEnquirySchema.index({ status: 1, createdAt: -1 });

export const PartnerEnquiry = mongoose.model("PartnerEnquiry", partnerEnquirySchema);
