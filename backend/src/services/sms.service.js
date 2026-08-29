import { env, isSmsConfigured } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * SMS delivery through the smsmode REST API (v1).
 *
 * Implemented with global fetch rather than axios: this is one POST with a
 * JSON body, and the Cloudinary service next door sets the same precedent —
 * a REST call does not earn a dependency.
 *
 * Docs: https://dev.smsmode.com/sms/v1
 */

export const smsEnabled = () => isSmsConfigured;

/**
 * smsmode wants an international number with no "+" and no separators
 * ("919876543210"). Guests are stored as bare 10-digit locals so that one
 * person is one account (see normalizePhone), so the country code is put back
 * on here, at the edge, and only here.
 *
 * A number that already carries its country code is passed through, so a
 * future international guest is not mangled into 91 + someone else's number.
 */
export const toInternational = (phone, countryCode = env.otp.countryCode) => {
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  return digits.length > 10 ? digits : `${countryCode}${digits}`;
};

/**
 * Sends one SMS.
 *
 * Throws on failure — the caller decides whether that is fatal. smsmode's
 * error body is descriptive, so it is surfaced in the message for the log;
 * it is never shown to the guest.
 */
export const sendSms = async (to, text) => {
  if (!isSmsConfigured) {
    throw new Error("SMSMODE_API_KEY is not configured");
  }

  const payload = {
    recipient: { to: toInternational(to) },
    body: { text },
  };

  if (env.smsmode.sender) payload.sender = { value: env.smsmode.sender };

  let response;
  try {
    response = await fetch(`${env.smsmode.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "X-Api-Key": env.smsmode.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      // Without this a hung gateway holds the request open until the client
      // gives up, and the guest sees a spinner rather than an error.
      signal: AbortSignal.timeout(env.smsmode.timeoutMs),
    });
  } catch (err) {
    // Network failure or timeout — fetch only rejects for these, never for a
    // 4xx/5xx, which is why the status check below is separate.
    throw new Error(`smsmode request failed: ${err.message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`smsmode API error ${response.status}: ${detail}`);
  }

  const data = await response.json().catch(() => ({}));
  // smsmode returns `messageId` on its 201 — the handle to quote when chasing
  // a delivery failure with their support.
  logger.info(`[SMS] sent to ${toInternational(to)} (messageId: ${data?.messageId ?? "unknown"})`);
  return data;
};
