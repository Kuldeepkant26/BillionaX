import crypto from "node:crypto";
import { env, isCredentialVaultConfigured } from "../config/env.js";
import { ApiError } from "./ApiError.js";

/**
 * Symmetric encryption for third-party credentials held in the database.
 *
 * This is the first encryption-at-rest in the platform. Everything else that
 * touches crypto here hashes (refresh tokens, OTPs) or signs (Cloudinary) —
 * one-way operations where the plaintext is never needed again. A Razorpay key
 * secret is different: it must come back out to sign a request.
 *
 * AES-256-GCM rather than CBC because GCM authenticates as well as encrypts.
 * Without the auth tag, a tampered ciphertext decrypts to plausible-looking
 * garbage and gets sent to Razorpay as a key; with it, decryption throws.
 *
 * THE KEY COMES FROM THE ENVIRONMENT, NEVER THE DATABASE. Storing it beside
 * the ciphertext it protects would be obfuscation, not encryption — anyone who
 * could read the collection could read both halves.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for.

/**
 * Versioned so the format can change without a flag day: a future key rotation
 * re-encrypts "v1:" rows into "v2:" and can tell them apart while both exist.
 */
const VERSION = "v1";

/** Fails loudly rather than silently storing plaintext. */
const keyBuffer = () => {
  if (!isCredentialVaultConfigured) {
    throw new ApiError(
      503,
      "Credential storage is not configured. Set CREDENTIAL_ENCRYPTION_KEY to save secrets."
    );
  }
  return Buffer.from(env.credentialKey, "hex");
};

/** True when the vault can be used, so callers can degrade instead of throwing. */
export const canStoreSecrets = () => isCredentialVaultConfigured;

/**
 * Encrypts a secret to "v1:<iv>:<tag>:<ciphertext>", all base64url.
 *
 * A fresh random IV per call is what stops two encryptions of the same secret
 * producing identical ciphertext — otherwise anyone reading the collection
 * could tell that two hotels share a key without decrypting either.
 */
export const encryptSecret = (plaintext) => {
  if (plaintext === null || plaintext === undefined || plaintext === "") return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
};

/**
 * Reverses encryptSecret. Throws on a tampered or truncated value rather than
 * returning something that looks like a key.
 */
export const decryptSecret = (stored) => {
  if (!stored) return null;

  const [version, iv, tag, ciphertext] = String(stored).split(":");

  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new ApiError(500, "Stored credential is not in a readable format");
  }

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      keyBuffer(),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    // Either the key changed or the row was altered. Both mean the same thing
    // to a caller: this secret cannot be trusted or used.
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Stored credential could not be decrypted. The encryption key may have changed."
    );
  }
};

/**
 * "rzp_live_AbCdEf123456" -> "rzp_live_••••3456".
 *
 * What the admin panel displays in place of a stored secret. Enough to confirm
 * which key is installed, never enough to use it. The tail is shown rather
 * than the head because Razorpay key IDs share a long common prefix.
 */
export const maskSecret = (value, visible = 4) => {
  if (!value) return null;
  const s = String(value);
  if (s.length <= visible) return "•".repeat(8);

  // Keep a recognisable prefix when the value has one ("rzp_live_", "rzp_test_").
  const prefixMatch = s.match(/^(rzp_(?:live|test)_)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";

  return `${prefix}${"•".repeat(4)}${s.slice(-visible)}`;
};
