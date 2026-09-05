import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError.js";
import { assertImplementsContract } from "./provider.interface.js";

/**
 * A payment provider that moves no money and makes no network calls.
 *
 * This is what runs before any Razorpay account exists, so the product can be
 * demonstrated to a prospective hotel end to end. It is deliberately NOT a set
 * of stubs returning empty objects: it writes the same Bill rows, emits the
 * same socket events on the same timeline, and produces the same history and
 * reports as the live path. The only difference is that no money moves.
 *
 * Demo-ness is recorded once, as `isDemo` on the Bill, purely so financial
 * reporting can exclude these rows. Nothing branches on it.
 *
 * Every generated id carries a `demo_` prefix. That is load-bearing rather
 * than cosmetic: `verifyPayment` refuses anything without it, so a live order
 * can never be confirmed by this provider, and a demo order can never be
 * confirmed by the live one.
 */

const DEMO_PREFIX = "demo_";

const demoId = (kind) => `${DEMO_PREFIX}${kind}_${crypto.randomBytes(10).toString("hex")}`;

/**
 * Stands in for network latency.
 *
 * Without it the demo is *too* fast — a payment that completes in zero
 * milliseconds reads as fake, and it would also hide the spinner and the
 * pending states that the live path genuinely spends time in. Those states
 * need to be exercised in a demo, because they are where bugs hide.
 */
const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const demoProvider = {
  mode: "DEMO",

  async createOrder({ amountPaise, currency = "INR", receipt, notes }) {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
      throw new ApiError(400, "A payable amount is required to start a payment");
    }

    await settle(180);

    return {
      providerOrderId: demoId("order"),
      amountPaise,
      currency,
      receipt,
      notes,
      // The browser's checkout needs a key id. A recognisably fake one keeps a
      // demo order from ever being opened against real Razorpay.
      keyId: "rzp_test_demo0000000000",
      isDemo: true,
    };
  },

  /**
   * Accepts any signature, but only for an order this provider issued.
   *
   * There is nothing to verify — no secret was used to sign — so the check
   * that matters is provenance: refusing a live order id here is what stops a
   * misconfigured deployment from confirming real payments for free.
   */
  async verifyPayment({ providerOrderId, providerPaymentId }) {
    await settle(120);

    if (!String(providerOrderId || "").startsWith(DEMO_PREFIX)) {
      throw new ApiError(
        400,
        "This payment was not created in demo mode and cannot be verified here"
      );
    }

    return {
      ok: true,
      providerOrderId,
      providerPaymentId: providerPaymentId || demoId("pay"),
      isDemo: true,
    };
  },

  async createLinkedAccount({ hotelId }) {
    await settle(400);

    return {
      linkedAccountId: demoId("acc"),
      // Demo onboarding always succeeds, so the rest of the flow — a hotel
      // that can accept payments — is reachable without a real KYC round trip.
      status: "activated",
      hotelId,
      isDemo: true,
    };
  },

  /**
   * Returns an already-verified account after a short delay.
   *
   * A real reverse penny drop waits for a human to pay ₹1 from their UPI app.
   * There is nobody to do that in a demo, so this resolves immediately —
   * including the `verified` block, because the whole point of penny drop is
   * that downstream code stores the bank's values rather than the typed ones,
   * and that code path must be exercised in demo too.
   */
  async initiateBankVerification({ ifsc, accountNumber, beneficiaryName }) {
    await settle(600);

    return {
      verificationId: demoId("vrfy"),
      status: "VERIFIED",
      upiLink: null,
      verified: {
        accountNumber,
        ifsc,
        beneficiaryName,
        registeredName: beneficiaryName,
        accountStatus: "active",
        bankName: "Demo Bank",
        // A perfect match, so the name-mismatch block is not tripped in a demo.
        nameMatchScore: 1,
      },
      isDemo: true,
    };
  },

  async getTransferStatus({ transferId }) {
    await settle(120);

    return {
      transferId,
      status: "processed",
      amountPaise: null,
      settledAtISO: new Date().toISOString(),
      isDemo: true,
    };
  },
};

export default assertImplementsContract(demoProvider, "demo");
