/**
 * Direct-to-Cloudinary upload.
 *
 * Deliberately uses bare fetch rather than the app's axios instance: this
 * request goes to Cloudinary, not our API, and must NOT carry the auth header
 * or the credentials the interceptor attaches.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

/**
 * Checked before asking the server for a signature — a 12 MP phone photo
 * should fail here, instantly and with a clear reason, rather than after a
 * long upload.
 */
export const validateImageFile = (file) => {
  if (!file) return "Choose an image";

  // HEIC from iOS sometimes arrives with an empty type, so fall back to the
  // extension rather than rejecting a legitimate photo.
  const type = file.type || "";
  const looksLikeImage = type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(file.name);
  if (!looksLikeImage) return "That file is not an image";

  if (type && !ACCEPTED_IMAGE_TYPES.includes(type) && !type.startsWith("image/")) {
    return "Use a JPG, PNG or WEBP image";
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — keep it under 5MB`;
  }

  return null;
};

/**
 * Posts the file with the server-issued signature and returns the delivery
 * URL. `onProgress` reports 0-100 via XHR, which fetch cannot do.
 */
export const uploadToCloudinary = (file, signed, onProgress) =>
  new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", signed.apiKey);
    form.append("timestamp", signed.timestamp);
    form.append("signature", signed.signature);
    form.append("folder", signed.folder);
    form.append("public_id", signed.publicId);
    // Part of the server's signature, so it must be sent back exactly as
    // given — omitting it makes Cloudinary reject the upload.
    if (signed.invalidate !== undefined) form.append("invalidate", String(signed.invalidate));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", signed.uploadUrl);

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      let body;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        return reject(new Error("Upload failed — unexpected response"));
      }

      if (xhr.status >= 200 && xhr.status < 300 && body.secure_url) {
        return resolve(body.secure_url);
      }
      reject(new Error(body?.error?.message || "Upload failed"));
    };

    xhr.onerror = () => reject(new Error("Upload failed — check your connection"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 60_000;

    xhr.send(form);
  });

/**
 * Rewrites a delivery URL to ask Cloudinary for a square, face-cropped,
 * auto-format version.
 *
 * Done at render time rather than upload: the original is stored untouched, so
 * changing the crop later is a code change, not a re-upload. f_auto serves
 * WebP/AVIF where supported, which is most of the saving.
 */
export const avatarUrl = (url, size = 128) => {
  if (!url || !url.includes("/image/upload/")) return url;
  const dpr = Math.min(2, Math.round(globalThis.devicePixelRatio || 1));
  return url.replace(
    "/image/upload/",
    `/image/upload/w_${size * dpr},h_${size * dpr},c_fill,g_face,f_auto,q_auto/`
  );
};
