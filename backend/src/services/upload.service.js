import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError.js";
import { env, isUploadConfigured } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Signed direct uploads to Cloudinary.
 *
 * The browser asks for a signature, then posts the file STRAIGHT to
 * Cloudinary — the bytes never touch this server. That means no multer, no
 * body-size limit to tune, and no memory spike when someone uploads a 12MP
 * photo from their phone.
 *
 * The API secret never leaves this process. What the browser receives is a
 * signature over a fixed set of parameters, valid for one upload: it cannot
 * be replayed into a different folder or a different transformation.
 *
 * Implemented against Cloudinary's REST API with node:crypto rather than the
 * official SDK. The signature is a SHA-1 over sorted params — one function —
 * and the SDK would add a dependency for that alone.
 */

const API_BASE = "https://api.cloudinary.com/v1_1";

/** Signatures are short-lived; an old one cannot be reused tomorrow. */
const SIGNATURE_TTL_SECONDS = 60 * 10;

export const uploadEnabled = () => isUploadConfigured;

const assertConfigured = () => {
  if (!isUploadConfigured) {
    throw new ApiError(
      503,
      "Image uploads are not configured yet. Add your Cloudinary credentials to enable them."
    );
  }
};

/**
 * Cloudinary's rule: sort the params, join as k=v pairs, append the secret,
 * SHA-1 the lot. Any param the client later changes invalidates the result.
 */
const sign = (params) => {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha1")
    .update(`${payload}${env.cloudinary.apiSecret}`)
    .digest("hex");
};

/**
 * Everything the browser needs to upload one file.
 *
 * `folder` and `public_id` are baked into the signature, so a caller cannot
 * redirect the upload elsewhere in the library or overwrite another user's
 * image by tampering with the request.
 */
export const createUploadSignature = ({ folder, publicId }) => {
  assertConfigured();

  const timestamp = Math.floor(Date.now() / 1000);
  const scopedFolder = `${env.cloudinary.folder}/${folder}`;

  const signed = { folder: scopedFolder, public_id: publicId, timestamp };

  return {
    signature: sign(signed),
    timestamp,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    folder: scopedFolder,
    publicId,
    uploadUrl: `${API_BASE}/${env.cloudinary.cloudName}/image/upload`,
    expiresIn: SIGNATURE_TTL_SECONDS,
  };
};

/**
 * True only for a delivery URL on THIS account.
 *
 * The upload response comes back through the browser, so the URL a client
 * sends us to store is client-controlled. Without this check a caller could
 * point their avatar at any address on the internet and we would happily
 * render it — a tracking pixel, or worse, on every screen showing that guest.
 */
export const isOwnCloudinaryUrl = (value) => {
  if (!value) return false;
  if (!isUploadConfigured) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname !== "res.cloudinary.com") return false;
    // Path starts with the cloud name: /<cloud>/image/upload/...
    return url.pathname.startsWith(`/${env.cloudinary.cloudName}/`);
  } catch {
    return false;
  }
};

/** Pulls `billionax/avatars/<id>` back out of a delivery URL, for deletion. */
export const publicIdFromUrl = (value) => {
  if (!isOwnCloudinaryUrl(value)) return null;

  try {
    const { pathname } = new URL(value);
    // /<cloud>/image/upload/[v123/][transforms/]<folder>/<id>.<ext>
    const afterUpload = pathname.split("/image/upload/")[1];
    if (!afterUpload) return null;

    const withoutVersion = afterUpload.replace(/^v\d+\//, "");
    return decodeURIComponent(withoutVersion.replace(/\.[a-z0-9]+$/i, ""));
  } catch {
    return null;
  }
};

/**
 * Removes an asset. Best-effort by design: a failed delete must never block
 * the user's action — the worst case is an orphaned file, which is cheaper
 * than a profile update that refuses to save.
 */
export const destroyAsset = async (publicId) => {
  if (!isUploadConfigured || !publicId) return false;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp });

  try {
    const response = await fetch(`${API_BASE}/${env.cloudinary.cloudName}/image/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        public_id: publicId,
        timestamp,
        signature,
        api_key: env.cloudinary.apiKey,
      }),
    });

    const result = await response.json();
    if (result?.result !== "ok" && result?.result !== "not found") {
      logger.warn(`Cloudinary delete for ${publicId}: ${JSON.stringify(result)}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.warn(`Cloudinary delete failed for ${publicId}: ${error.message}`);
    return false;
  }
};
