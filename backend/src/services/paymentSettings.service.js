import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { env, isRazorpayConfigured } from "../config/env.js";
import { canStoreSecrets, decryptSecret, encryptSecret, maskSecret } from "../utils/crypto.util.js";
import { paymentMode } from "../payments/index.js";
import { getSettings, updateSettings } from "./settings.service.js";

/**
 * Razorpay credentials as the admin panel sees and edits them.
 *
 * Two rules run through everything here:
 *
 *  1. A secret never travels back to the browser. Reads return a masked value
 *     and a flag saying whether one is stored; the panel offers "Replace",
 *     never "Edit". A field pre-filled with a real secret would put it in the
 *     DOM, the response cache and every logging proxy in between.
 *
 *  2. Environment variables win over anything stored here. A key set at deploy
 *     time is an operational decision, and it must not be overridable through a
 *     web form by anyone who reaches the admin panel.
 */

/** What the panel renders. Safe to serialise. */
export const getPaymentSettings = async () => {
  const settings = await getSettings({ fresh: true });
  const stored = settings.razorpay || {};

  // env first, stored second — the same precedence the provider resolves with.
  const effectiveKeyId = env.razorpay.keyId || stored.keyId || null;
  const hasSecret = Boolean(env.razorpay.keySecret || stored.keySecretEncrypted);
  const hasWebhookSecret = Boolean(env.razorpay.webhookSecret || stored.webhookSecretEncrypted);

  return {
    // The mode the RUNNING process is in. Credentials saved since boot do not
    // change it until a restart, and saying so is better than implying a switch
    // that has not happened.
    mode: paymentMode(),
    // What the mode WOULD be after a restart, so the panel can prompt for one.
    modeAfterRestart: effectiveKeyId && hasSecret ? "LIVE" : "DEMO",
    restartRequired: (effectiveKeyId && hasSecret) !== isRazorpayConfigured,

    keyId: effectiveKeyId,
    keySecretMasked: hasSecret ? maskSecret(env.razorpay.keySecret || "stored-secret") : null,
    hasSecret,
    hasWebhookSecret,
    routeEnabled: Boolean(stored.routeEnabled),
    verifiedAt: stored.verifiedAt || null,
    transferHoldHours: settings.transferHoldHours,

    // Where each value comes from, so an admin editing a field that will be
    // ignored is told rather than left wondering why nothing changed.
    source: {
      keyId: env.razorpay.keyId ? "env" : stored.keyId ? "database" : null,
      keySecret: env.razorpay.keySecret ? "env" : stored.keySecretEncrypted ? "database" : null,
      webhookSecret: env.razorpay.webhookSecret
        ? "env"
        : stored.webhookSecretEncrypted
          ? "database"
          : null,
    },

    canStoreSecrets: canStoreSecrets(),
  };
};

/**
 * Checks a key pair against Razorpay before it is trusted.
 *
 * Deliberately a real call rather than a format check: a well-formed key that
 * has been revoked looks identical to a working one, and the moment to discover
 * that is while an admin is watching, not during a guest's first payment.
 */
export const verifyCredentials = async ({ keyId, keySecret }) => {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  let response;
  try {
    // Any authenticated read works; payments?count=1 is the cheapest.
    response = await fetch(`${env.razorpay.baseUrl}/payments?count=1`, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(env.razorpay.timeoutMs),
    });
  } catch (error) {
    logger.warn(`Razorpay credential check failed to connect: ${error.message}`);
    throw new ApiError(502, "Could not reach Razorpay to check those credentials");
  }

  if (response.status === 401) {
    throw new ApiError(400, "Razorpay rejected that key pair. Check the ID and secret.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      502,
      body?.error?.description || "Razorpay could not confirm those credentials"
    );
  }

  return { ok: true };
};

/**
 * Saves credentials, after checking them.
 *
 * Only fields that were actually supplied are written: an admin changing the
 * webhook secret alone must not blank the key secret, which is what a plain
 * object merge would do with an absent field.
 */
export const savePaymentSettings = async ({
  keyId,
  keySecret,
  webhookSecret,
  routeEnabled,
  transferHoldHours,
  userId,
}) => {
  const settings = await getSettings({ fresh: true });
  const stored = settings.razorpay || {};
  const patch = { razorpay: { ...stored.toObject?.() ?? stored } };

  if (keyId !== undefined) patch.razorpay.keyId = keyId || null;
  if (routeEnabled !== undefined) patch.razorpay.routeEnabled = Boolean(routeEnabled);
  if (transferHoldHours !== undefined) patch.transferHoldHours = Number(transferHoldHours);

  const wantsSecret = Boolean(keySecret);
  const wantsWebhook = Boolean(webhookSecret);

  if ((wantsSecret || wantsWebhook) && !canStoreSecrets()) {
    throw new ApiError(
      503,
      "Set CREDENTIAL_ENCRYPTION_KEY on the server before storing payment secrets."
    );
  }

  // Verified BEFORE anything is written, so a bad pair cannot half-land.
  if (wantsSecret) {
    const effectiveKeyId = keyId || stored.keyId;
    if (!effectiveKeyId) throw new ApiError(400, "Enter the Key ID as well as the secret");

    await verifyCredentials({ keyId: effectiveKeyId, keySecret });

    patch.razorpay.keySecretEncrypted = encryptSecret(keySecret);
    patch.razorpay.verifiedAt = new Date();
  }

  if (wantsWebhook) patch.razorpay.webhookSecretEncrypted = encryptSecret(webhookSecret);

  await updateSettings(patch, userId);
  logger.info(`Payment credentials updated by ${userId}`);

  return getPaymentSettings();
};

/** Removes stored credentials, returning the platform to demo on next restart. */
export const clearPaymentSettings = async (userId) => {
  await updateSettings(
    {
      razorpay: {
        keyId: null,
        keySecretEncrypted: null,
        webhookSecretEncrypted: null,
        routeEnabled: false,
        verifiedAt: null,
      },
    },
    userId
  );

  logger.warn(`Payment credentials cleared by ${userId}`);
  return getPaymentSettings();
};

/**
 * The live secret, for the provider.
 *
 * env wins; a stored value is decrypted on demand and never cached in a form
 * that outlives the call.
 */
export const resolveSecrets = async () => {
  if (env.razorpay.keyId && env.razorpay.keySecret) {
    return {
      keyId: env.razorpay.keyId,
      keySecret: env.razorpay.keySecret,
      webhookSecret: env.razorpay.webhookSecret,
    };
  }

  const settings = await getSettings();
  const stored = settings.razorpay || {};
  if (!stored.keyId || !stored.keySecretEncrypted) return null;

  return {
    keyId: stored.keyId,
    keySecret: decryptSecret(stored.keySecretEncrypted),
    webhookSecret: stored.webhookSecretEncrypted
      ? decryptSecret(stored.webhookSecretEncrypted)
      : null,
  };
};
