import { env, isEmailConfigured } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Transactional email through the Brevo API (v3).
 *
 * Same shape and the same reasoning as sms.service.js next door: one POST with
 * a JSON body, so global fetch rather than an SDK.
 *
 * Docs: https://developers.brevo.com/reference/sendtransacemail
 */

export const emailEnabled = () => isEmailConfigured;

export const normalizeEmail = (raw = "") => String(raw).trim().toLowerCase();

/**
 * Brevo accepts both `htmlContent` and `textContent`. Both are sent: the plain
 * text part is what shows in notification previews and in clients that refuse
 * HTML, and its absence is itself a mild spam signal.
 */
export const sendEmail = async ({ to, subject, html, text }) => {
  if (!isEmailConfigured) {
    throw new Error("BREVO_API_KEY is not configured");
  }

  const payload = {
    sender: { email: env.email.fromAddress, name: env.email.fromName },
    to: [{ email: normalizeEmail(to) }],
    subject,
    htmlContent: html,
    textContent: text,
  };

  let response;
  try {
    response = await fetch(`${env.email.baseUrl}/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": env.email.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      // A hung provider must not hold the guest's request open indefinitely.
      signal: AbortSignal.timeout(env.email.timeoutMs),
    });
  } catch (err) {
    // fetch only rejects on network failure or timeout, never on a 4xx/5xx —
    // hence the separate status check below.
    throw new Error(`Brevo request failed: ${err.message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo API error ${response.status}: ${detail}`);
  }

  const data = await response.json().catch(() => ({}));
  logger.info(`[EMAIL] sent to ${normalizeEmail(to)} (messageId: ${data?.messageId ?? "unknown"})`);
  return data;
};
