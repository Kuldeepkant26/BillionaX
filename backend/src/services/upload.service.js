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
/** Cloudinary scopes every asset operation by resource type. */
const RESOURCE_TYPES = ["image", "video"];

const assertResourceType = (resourceType) => {
  if (!RESOURCE_TYPES.includes(resourceType)) {
    throw new ApiError(400, `Unsupported upload type: ${resourceType}`);
  }
};

export const createUploadSignature = ({ folder, publicId, resourceType = "image" }) => {
  assertConfigured();
  assertResourceType(resourceType);

  const timestamp = Math.floor(Date.now() / 1000);
  const scopedFolder = `${env.cloudinary.folder}/${folder}`;

  // invalidate purges the CDN copy of the previous file at this public_id.
  // Avatars and logos overwrite a fixed public_id, so the delivery URL is
  // unchanged between versions — without this the CDN keeps serving the OLD
  // picture for hours after a change, which looks exactly like a failed save.
  const signed = { folder: scopedFolder, invalidate: true, public_id: publicId, timestamp };

  return {
    signature: sign(signed),
    timestamp,
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    folder: scopedFolder,
    // Every signed param must be echoed back verbatim by the browser, or
    // Cloudinary recomputes a different signature and rejects the upload.
    invalidate: true,
    publicId,
    resourceType,
    // The resource type is part of the ENDPOINT, not the signed params, so it
    // does not affect the signature — but posting a video to /image/upload
    // fails, hence threading it through here.
    uploadUrl: `${API_BASE}/${env.cloudinary.cloudName}/${resourceType}/upload`,
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

/**
 * Pulls `billionax/avatars/<id>` back out of a delivery URL, for deletion.
 *
 * Returns the public_id ONLY — no version, no transformation. Both are part of
 * how an asset is *delivered*, not of its identity, and two URLs differing in
 * either still name the same file. Callers rely on that: comparing public_ids
 * is how they tell an overwrite ("same file, new bytes") from a genuine
 * replacement, and deleting on a mismatch that was really just a different
 * version would destroy the live avatar.
 */
export const publicIdFromUrl = (value) => {
  if (!isOwnCloudinaryUrl(value)) return null;

  try {
    const { pathname } = new URL(value);
    // /<cloud>/<image|video>/upload/[transforms/][v123/]<folder>/<id>.<ext>
    // Matched generically: splitting on the literal "/image/upload/" returned
    // null for every video URL, which silently disabled asset cleanup for
    // them — an orphaned file on every replace.
    const marker = pathname.match(/\/(image|video)\/upload\//);
    if (!marker) return null;
    const afterUpload = pathname.slice(marker.index + marker[0].length);
    if (!afterUpload) return null;

    // Transformations are slash-separated segments of comma-joined `k_v` pairs
    // (w_160,h_160,c_fill). They may appear before AND after the version, so
    // drop every leading segment that looks like one rather than just the
    // first — a public_id itself never contains a comma-joined k_v list.
    const isTransform = (segment) =>
      segment.length > 0 &&
      segment.split(",").every((part) => /^[a-z]{1,3}_[^/]+$/i.test(part));

    const segments = afterUpload.split("/");
    while (segments.length > 1 && (isTransform(segments[0]) || /^v\d+$/.test(segments[0]))) {
      segments.shift();
    }

    const withoutExtension = segments.join("/").replace(/\.[a-z0-9]+$/i, "");
    return decodeURIComponent(withoutExtension) || null;
  } catch {
    return null;
  }
};

/**
 * Which Cloudinary pipeline a delivery URL belongs to.
 *
 * destroy is scoped by resource type, so deleting a video through the image
 * endpoint reports "not found" and silently leaves the file behind. Callers
 * that hold only a URL use this to pick the right one.
 */
export const resourceTypeFromUrl = (value) =>
  /\/video\/upload\//.test(String(value || "")) ? "video" : "image";

/**
 * Removes an asset. Best-effort by design: a failed delete must never block
 * the user's action — the worst case is an orphaned file, which is cheaper
 * than a profile update that refuses to save.
 */
export const destroyAsset = async (publicId, resourceType = "image") => {
  if (!isUploadConfigured || !publicId) return false;
  if (!RESOURCE_TYPES.includes(resourceType)) return false;

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign({ public_id: publicId, timestamp });

  try {
    const response = await fetch(
      `${API_BASE}/${env.cloudinary.cloudName}/${resourceType}/destroy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_id: publicId,
          timestamp,
          signature,
          api_key: env.cloudinary.apiKey,
        }),
      }
    );

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
