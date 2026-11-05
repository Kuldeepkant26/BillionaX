import mongoose from "mongoose";
import { PURCHASE_STATUS, PURCHASE_STATUS_VALUES } from "../config/constants.js";

/** A hotel buying coin inventory from the platform. */
const coinPurchaseSchema = new mongoose.Schema(
  {
    hotelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hotel", required: true, index: true },
    coins: { type: Number, required: true, min: 1 },
    amountPaid: { type: Number, required: true, min: 0 },
    unitPricePaise: { type: Number, default: 100 },

    paymentRef: { type: String, trim: true, default: "manual" },
    note: { type: String, trim: true, maxlength: 500 },

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Voided rather than deleted, so the record stays append-only and auditable.
    status: {
      type: String,
      enum: PURCHASE_STATUS_VALUES,
      default: PURCHASE_STATUS.COMPLETED,
    },

    // Set when the main admin reverses the credit — see coinService.reversePurchase.
    voidedAt: { type: Date, default: null },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    voidReason: { type: String, trim: true, maxlength: 200, default: null },
  },
  { timestamps: true }
);

coinPurchaseSchema.index({ hotelId: 1, createdAt: -1 });

export const CoinPurchase = mongoose.model("CoinPurchase", coinPurchaseSchema);
