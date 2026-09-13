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
 * Videos get their own, much larger cap.
 *
 * 100MB is roughly a two-minute clip from a phone at 1080p. Cloudinary's own
 * limit on a free plan is 100MB per file, so anything above this would fail at
 * their end after a long upload — better to say so before it starts.
 */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const ACCEPTED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
];

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
 * Same shape as validateImageFile, for video.
 *
 * MOV from an iPhone reports `video/quicktime`; some Android recorders send an
 * empty type, so the extension is the fallback rather than an outright reject.
 */
export const validateVideoFile = (file) => {
  if (!file) return "Choose a video";

  const type = file.type || "";
  const looksLikeVideo = type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
  if (!looksLikeVideo) return "That file is not a video";

  if (type && !type.startsWith("video/")) return "Use an MP4, MOV or WEBM video";

  if (file.size > MAX_VIDEO_BYTES) {
    return `That video is ${(file.size / 1024 / 1024).toFixed(0)}MB — keep it under 100MB`;
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
    // A 100MB video on hotel wifi takes minutes; the old flat 60s killed every
    // real video upload just as it was finishing. Images keep the short
    // timeout, where a stall genuinely means something is wrong.
    xhr.timeout = signed.resourceType === "video" ? 15 * 60_000 : 60_000;

    xhr.send(form);
  });

/**
 * A poster frame for a video, straight from Cloudinary.
 *
 * Cloudinary renders a still from any video by swapping the extension, so a
 * hotel never has to upload a separate thumbnail — the card art works even
 * when they only gave us a clip. so_0 takes the first frame; f_auto/q_auto
 * hand back WebP at a sane weight.
 */
export const videoPoster = (url, width = 480) => {
  if (!url || !url.includes("/video/upload/")) return null;
  const dpr = Math.min(2, Math.round(globalThis.devicePixelRatio || 1));
  return url
    .replace("/video/upload/", `/video/upload/so_0,w_${width * dpr},c_fill,f_auto,q_auto/`)
    .replace(/\.(mp4|mov|webm|m4v)$/i, ".jpg");
};

/**
 * Playback URL.
 *
 * f_mp4 and NOT f_auto,q_auto. This looks like a downgrade and is the opposite:
 * q_auto makes Cloudinary transcode on the fly, and a derivation it has not
 * cached yet is streamed chunked — no Content-Length and `Accept-Ranges: none`.
 * The browser then sees only the first fragment, so `loadedmetadata` reports a
 * duration of a couple of seconds for a two-minute clip and the scrubber cannot
 * seek at all, because seeking IS a range request.
 *
 * f_mp4 serves the whole file with a Content-Length and byte ranges, which is
 * what makes both the duration readout and the scrubber work. The original
 * upload is still never modified.
 */
export const videoStream = (url) => {
  if (!url || !url.includes("/video/upload/")) return url;
  return url.replace("/video/upload/", "/video/upload/f_mp4/");
};

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

/**
 * A feed photo at display width, in whatever shape it was taken.
 *
 * NOT avatarUrl. That one is square, c_fill and g_face — right for a face in a
 * circle, wrong for a photograph: it would crop a landscape shot to a square
 * centred on a face that may not be in it. c_limit only ever scales DOWN, so a
 * small image is left alone rather than upscaled.
 *
 * f_auto/q_auto is where the saving is; the crop was never the point.
 */
export const feedImage = (url, width = 460) => {
  if (!url || !url.includes("/image/upload/")) return url;
  const dpr = Math.min(2, Math.round(globalThis.devicePixelRatio || 1));
  return url.replace("/image/upload/", `/image/upload/w_${width * dpr},c_limit,f_auto,q_auto/`);
};
