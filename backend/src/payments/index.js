import { isRazorpayConfigured } from "../config/env.js";
import { logger } from "../utils/logger.js";
import demoProvider from "./demo.provider.js";
import razorpayProvider from "./razorpay.provider.js";

/**
 * Chooses the payment provider, and is the only payments module the rest of
 * the app imports.
 *
 * Selection is by CREDENTIAL PRESENCE, never NODE_ENV — the same rule
 * isUploadConfigured follows. That means a staging deployment holding real
 * keys behaves exactly like production, and a production deployment that has
 * not been given keys yet degrades to a working demo rather than failing every
 * payment. NODE_ENV would get both of those backwards.
 *
 * Resolved ONCE at module load rather than per call. A credential change
 * mid-request could otherwise create an order with one provider and verify it
 * with the other, which is a payment that can never be confirmed. Switching
 * providers is a restart, deliberately.
 */

const provider = isRazorpayConfigured ? razorpayProvider : demoProvider;

logger.info(
  isRazorpayConfigured
    ? "Payments: LIVE mode (Razorpay credentials found)"
    : "Payments: DEMO mode — no Razorpay credentials configured, no money will move"
);

/** The active provider. See provider.interface.js for the contract. */
export const getPaymentProvider = () => provider;

/** "LIVE" | "DEMO" — for the admin panel's mode indicator, and for logs. */
export const paymentMode = () => provider.mode;

/**
 * Whether this run is writing demo records.
 *
 * Read ONLY when stamping `isDemo` on a Bill, so financial reporting can
 * exclude those rows. It is not a feature flag: no controller, service or
 * component may branch on it, because that is precisely the divergence between
 * demo and live that this whole layer exists to prevent.
 */
export const isDemoPayments = () => provider.mode === "DEMO";
