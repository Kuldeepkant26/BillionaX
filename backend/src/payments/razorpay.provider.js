import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { assertImplementsContract } from "./provider.interface.js";

/**
 * The live provider.
 *
 * Written against Razorpay's REST API with global fetch rather than the SDK,
 * for the same reason upload.service.js talks to Cloudinary directly: the
 * surface we need is a handful of JSON endpoints plus one HMAC, and the SDK
 * would be a dependency carrying far more than that.
 *
 * `verifyPayment` is the security-critical method here — the one thing standing
 * between a forged callback and a bill marked paid — and it is pure local
 * crypto, no network call.
 */

/**
 * One request to Razorpay, with auth, a timeout, and errors mapped to ApiError.
 *
 * One place for the auth header, the timeout and the failure shape, so every
 * call fails the same recognisable way.
 */
export const razorpayFetch = async (path, { method = "GET", body } = {}) => {
  const auth = Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString("base64");

  let response;
  try {
    response = await fetch(`${env.razorpay.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      // A hung payment request must not hold a guest's checkout open forever.
      signal: AbortSignal.timeout(env.razorpay.timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    logger.error(`Razorpay ${method} ${path} failed: ${error.message}`);
    throw new ApiError(
      502,
      timedOut
        ? "The payment provider did not respond in time. Please try again."
        : "Could not reach the payment provider. Please try again."
    );
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Razorpay nests its human-readable reason here; surfacing it beats a bare
    // status code when a hotel's onboarding is rejected for a fixable reason.
    const reason = payload?.error?.description || "The payment provider rejected the request";
    logger.error(`Razorpay ${method} ${path} -> ${response.status}: ${reason}`);
    throw new ApiError(response.status === 400 ? 400 : 502, reason);
  }

  return payload;
};

const razorpayProvider = {
  mode: "LIVE",

  /**
   * Opens an order the browser's checkout can be launched against.
   *
   * The Route transfer rides along on the order rather than being made after
   * capture: Razorpay then splits the money as part of settling the payment,
   * so there is no window where the full amount sits with the platform and a
   * crash could strand the hotel's share.
   *
   * on_hold keeps the hotel's share unreleased for a configurable window, so a
   * refund or a chargeback in the first couple of days comes out of money we
   * still control rather than being clawed back from the hotel.
   */
  async createOrder({ amountPaise, currency = "INR", receipt, notes, transfer }) {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new ApiError(400, "A payable amount is required to start a payment");
    }

    const body = {
      amount: amountPaise,
      currency,
      receipt: String(receipt || ""),
      notes: notes || {},
    };

    // Only when the hotel has an activated linked account; without one there is
    // nobody to transfer to and Razorpay rejects the order outright.
    if (transfer?.linkedAccountId && transfer.amountPaise > 0) {
      body.transfers = [
        {
          account: transfer.linkedAccountId,
          amount: transfer.amountPaise,
          currency,
          notes: notes || {},
          on_hold: true,
          ...(transfer.holdUntilUnix ? { on_hold_until: transfer.holdUntilUnix } : {}),
        },
      ];
    }

    const order = await razorpayFetch("/orders", { method: "POST", body });

    return {
      providerOrderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      // Public by design — the browser needs it to open checkout. The secret
      // never leaves this process.
      keyId: env.razorpay.keyId,
      isDemo: false,
    };
  },

  /**
   * Confirms a checkout callback really came from Razorpay.
   *
   * The signature is HMAC-SHA256 of "<order_id>|<payment_id>" keyed with the
   * API secret. Without this check, anyone who knows a bill's order id could
   * POST a fabricated success and have the bill marked paid.
   *
   * Compared with timingSafeEqual rather than ===, so the comparison cannot be
   * probed a byte at a time. It needs equal-length buffers, hence the length
   * check first — a wrong-length signature is already a failure.
   */
  async verifyPayment({ providerOrderId, providerPaymentId, signature }) {
    if (!providerOrderId || !providerPaymentId || !signature) {
      throw new ApiError(400, "Incomplete payment confirmation");
    }

    const expected = crypto
      .createHmac("sha256", env.razorpay.keySecret)
      .update(`${providerOrderId}|${providerPaymentId}`)
      .digest();

    const received = Buffer.from(String(signature), "hex");

    const ok =
      received.length === expected.length && crypto.timingSafeEqual(received, expected);

    if (!ok) {
      logger.warn(`Rejected payment signature for order ${providerOrderId}`);
    }

    return { ok, providerOrderId, providerPaymentId, isDemo: false };
  },

  /**
   * Onboards a hotel onto Route: account, stakeholder, then the product config.
   *
   * Three sequential calls because each needs the id from the one before. A
   * failure partway through leaves a real account at Razorpay, which is why the
   * id is returned even on a partial success — retrying from scratch would
   * create a duplicate account for the same PAN, and Razorpay rejects that in a
   * way that is tedious to unpick.
   */
  async createLinkedAccount({
    hotelId,
    name,
    email,
    phone,
    businessType,
    ifsc,
    accountNumber,
    beneficiaryName,
  }) {
    const account = await razorpayFetch("/accounts", {
      method: "POST",
      body: {
        email,
        phone,
        type: "route",
        legal_business_name: name,
        business_type: businessType || "proprietorship",
        contact_name: beneficiaryName || name,
        notes: { hotelId: String(hotelId) },
      },
    });

    let status = "pending";

    try {
      await razorpayFetch(`/accounts/${account.id}/stakeholders`, {
        method: "POST",
        body: { name: beneficiaryName || name, email },
      });

      const product = await razorpayFetch(`/accounts/${account.id}/products`, {
        method: "POST",
        body: { product_name: "route", tnc_accepted: true },
      });

      // The verified bank details — never the typed ones. See
      // onboarding.service.js for why that distinction is the whole point.
      const configured = await razorpayFetch(
        `/accounts/${account.id}/products/${product.id}`,
        {
          method: "PATCH",
          body: {
            settlements: {
              account_number: accountNumber,
              ifsc_code: ifsc,
              beneficiary_name: beneficiaryName,
            },
            tnc_accepted: true,
          },
        }
      );

      status = configured.activation_status === "activated" ? "activated" : "pending";
    } catch (error) {
      // The account exists; the configuration did not finish. Surfaced as
      // needs_clarification so an admin can see it rather than a retry loop
      // silently creating a second account.
      logger.error(`Route configuration incomplete for ${account.id}: ${error.message}`);
      return { linkedAccountId: account.id, status: "needs_clarification", isDemo: false };
    }

    return { linkedAccountId: account.id, status, isDemo: false };
  },

  /**
   * Starts a reverse penny drop: the owner pays ₹1 from their own UPI app.
   *
   * Reverse rather than a conventional drop because paying FROM the account
   * proves control of it, where receiving into it only proves the number was
   * typed correctly.
   *
   * Returns PENDING with a UPI link; the result arrives by webhook. A
   * "completed" status later does NOT mean the account is valid — it means the
   * check finished, and the result fields are what decide.
   */
  async initiateBankVerification({ ifsc, accountNumber, beneficiaryName }) {
    const validation = await razorpayFetch("/fund_accounts/validations", {
      method: "POST",
      body: {
        account: {
          id: null,
          entity: "fund_account",
          account_type: "bank_account",
          bank_account: {
            name: beneficiaryName,
            ifsc,
            account_number: accountNumber,
          },
        },
        amount: 100, // ₹1 in paise
        currency: "INR",
        notes: { purpose: "account verification" },
      },
    });

    return {
      verificationId: validation.id,
      status: validation.status === "completed" ? "VERIFIED" : "PENDING",
      upiLink: validation.results?.upi_link || null,
      verified:
        validation.status === "completed"
          ? {
              accountNumber: validation.fund_account?.bank_account?.account_number,
              ifsc: validation.fund_account?.bank_account?.ifsc,
              beneficiaryName: validation.fund_account?.bank_account?.name,
              registeredName: validation.results?.registered_name || null,
              accountStatus: validation.results?.account_status || null,
              bankName: validation.fund_account?.bank_account?.bank_name || null,
            }
          : null,
      isDemo: false,
    };
  },

  async getTransferStatus({ transferId }) {
    const transfer = await razorpayFetch(`/transfers/${transferId}`);

    return {
      transferId: transfer.id,
      status: transfer.status,
      amountPaise: transfer.amount,
      settledAtISO: transfer.settled_at ? new Date(transfer.settled_at * 1000).toISOString() : null,
      isDemo: false,
    };
  },
};

/**
 * Verifies a webhook body against the webhook secret.
 *
 * Separate from verifyPayment because it is a different secret over a
 * different payload: the RAW request body, which is why the webhook route must
 * be mounted before express.json(). Re-serialising a parsed body changes key
 * order and whitespace, and the signature no longer matches.
 */
export const verifyWebhookSignature = ({ rawBody, signature }) => {
  if (!rawBody || !signature) return false;

  const expected = crypto
    .createHmac("sha256", env.razorpay.webhookSecret)
    .update(rawBody)
    .digest();

  const received = Buffer.from(String(signature), "hex");

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
};

export default assertImplementsContract(razorpayProvider, "razorpay");
