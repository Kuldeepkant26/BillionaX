/**
 * The payment provider contract.
 *
 * Documentation rather than an abstract class: this codebase uses no classes
 * outside Mongoose models, and JavaScript cannot enforce an interface at
 * runtime anyway. What this file buys is one place where the contract is
 * written down, so the demo and live implementations cannot quietly drift.
 *
 * THE RULE THIS EXISTS TO PROTECT: everything above this layer — controllers,
 * services, sockets, React components — is identical in demo and live mode.
 * There are no `if (isDemoMode)` branches anywhere else. If a caller ever
 * needs to know which provider it is talking to, the abstraction is wrong and
 * should be fixed here rather than worked around there.
 *
 * MONEY IS ALWAYS PAISE, always an integer. Every amount crossing this
 * boundary is named `amountPaise` so a rupee value cannot be passed by
 * accident — a 100x error in a payment is not a rounding bug.
 *
 * @typedef {Object} OrderRequest
 * @property {number} amountPaise   What the guest is charged, in paise.
 * @property {string} receipt       Our own reference, the bill id.
 * @property {Object} [notes]       Free-form metadata echoed back by the provider.
 * @property {string} [currency]    Defaults to INR.
 *
 * @typedef {Object} OrderResult
 * @property {string} providerOrderId  Opaque id the checkout is opened with.
 * @property {number} amountPaise
 * @property {string} currency
 * @property {string} keyId            Public key the browser needs. Never the secret.
 * @property {boolean} isDemo          Audit only. Nothing branches on it.
 *
 * @typedef {Object} VerifyRequest
 * @property {string} providerOrderId
 * @property {string} providerPaymentId
 * @property {string} signature
 *
 * @typedef {Object} VerifyResult
 * @property {boolean} ok              False means do NOT mark the bill paid.
 * @property {string} providerPaymentId
 *
 * @typedef {Object} LinkedAccountRequest
 * @property {string} hotelId
 * @property {string} name             Legal business name, as on the PAN.
 * @property {string} email
 * @property {string} phone
 * @property {string} businessType
 * @property {string} ifsc             VERIFIED value, never the typed one.
 * @property {string} accountNumber    VERIFIED value, never the typed one.
 * @property {string} beneficiaryName  VERIFIED value, never the typed one.
 *
 * @typedef {Object} LinkedAccountResult
 * @property {string} linkedAccountId
 * @property {string} status           pending | activated | needs_clarification | failed
 *
 * @typedef {Object} BankVerificationResult
 * @property {string} verificationId
 * @property {string} status           PENDING | VERIFIED | FAILED
 * @property {string} [upiLink]        What the QR encodes, for the ₹1 drop.
 * @property {Object} [verified]       The values the bank returned, once known.
 *
 * @typedef {Object} TransferStatusResult
 * @property {string} transferId
 * @property {string} status
 * @property {number} amountPaise
 * @property {string|null} settledAtISO
 */

/**
 * Every method a provider must implement. Exported so a test can assert both
 * implementations are complete, which is cheaper than discovering a missing
 * method during a live payment.
 */
export const PROVIDER_CONTRACT = Object.freeze([
  "createOrder",
  "verifyPayment",
  "createLinkedAccount",
  "initiateBankVerification",
  "getTransferStatus",
]);

/** Throws if an implementation is missing a method the contract promises. */
export const assertImplementsContract = (provider, label) => {
  const missing = PROVIDER_CONTRACT.filter((method) => typeof provider?.[method] !== "function");

  if (missing.length) {
    throw new Error(`Payment provider "${label}" is missing: ${missing.join(", ")}`);
  }

  return provider;
};
