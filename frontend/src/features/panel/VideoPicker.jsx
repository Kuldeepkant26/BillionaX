import { useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore.js";
import {
  uploadToCloudinary,
  validateVideoFile,
  videoPoster,
  videoStream,
} from "../../utils/upload.js";
import styles from "./ImagePicker.module.css";

/**
 * Pick-and-upload for a card's video, mirroring ImagePicker.
 *
 * Like ImagePicker it does NOT save on its own — the parent form's Save writes
 * the URL, and the previous asset is deleted server-side only once that
 * happens. Uploading then cancelling leaves the record untouched.
 *
 * Two things differ from an image upload and both matter to the manager:
 * a video takes long enough that the progress figure is the only sign it is
 * working, and the duration is read off the file so nobody has to type "1:20"
 * by hand.
 */
const linkBtn = "border-0 bg-none p-0 font-[inherit] text-[11.5px] font-semibold cursor-pointer";

/** "83" -> "1:23". Display only, matching the model's free-text duration. */
const formatDuration = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

/**
 * Reads the duration out of the file before it is uploaded.
 *
 * Resolves to "" rather than rejecting on a codec the browser cannot decode —
 * a missing badge is a far better outcome than a blocked upload.
 */
const readDuration = (file) =>
  new Promise((resolve) => {
    const el = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value) => {
      URL.revokeObjectURL(url);
      el.remove();
      resolve(value);
    };

    el.preload = "metadata";
    el.onloadedmetadata = () => done(formatDuration(el.duration));
    el.onerror = () => done("");
    // Never let a stuck decode hold up the upload.
    setTimeout(() => done(""), 4000);
    el.src = url;
  });

export const VideoPicker = ({
  value,
  onChange,
  onDurationDetected,
  getSignature,
  label = "Video",
  hint = "MP4, MOV or WEBM, up to 100MB.",
}) => {
  const inputRef = useRef(null);
  const toastError = useAppStore((s) => s.toastError);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const poster = value ? videoPoster(value, 480) : null;

  const pick = (event) => {
    const file = event.target.files?.[0];
    // Reset first, or re-picking the same file after an error fires no event.
    event.target.value = "";
    if (!file) return;

    const problem = validateVideoFile(file);
    if (problem) return toastError(problem);

    upload(file);
  };

  const upload = async (file) => {
    setBusy(true);
    setProgress(0);

    try {
      // Read the duration while the signature request is in flight rather than
      // after it: both are needed before the upload finishes, and neither
      // depends on the other.
      const [signed, duration] = await Promise.all([getSignature(), readDuration(file)]);
      const uploaded = await uploadToCloudinary(file, signed, setProgress);
      onChange(uploaded);
      if (duration) onDurationDetected?.(duration);
    } catch (err) {
      toastError(err.message || "Could not upload that video");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="mb-3.5">
      <span className="label">{label}</span>

      <button
        type="button"
        className={`relative block w-full p-0 overflow-hidden border-[1.5px] rounded-token-sm cursor-pointer disabled:cursor-progress transition-[border-color,background] duration-150 enabled:hover:border-accent ${
          styles.wide
        } ${value ? "border-solid bg-surface" : "border-dashed bg-chip"} border-hairline`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={value ? "Change video" : "Upload video"}
      >
        {value ? (
          <>
            {/* The poster is a frame Cloudinary renders from the video itself,
                so a manager never uploads a thumbnail separately. */}
            {poster ? (
              <img src={poster} alt="" className="block h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 bg-[var(--hero)]" />
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/25">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow-[0_2px_10px_rgba(0,0,0,.35)]">
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path d="M8 5.5v13l11-6.5z" fill="#14120f" />
                </svg>
              </span>
            </span>
          </>
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-[3px] p-3 text-center text-muted">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <rect
                x="3"
                y="6"
                width="13"
                height="12"
                rx="2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path
                d="M16 10.5 21 8v8l-5-2.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
            </svg>
            <b className="mt-1 text-[12.5px] font-semibold text-ink">Choose a video</b>
            <i className="not-italic text-[11px] leading-[1.4]">{hint}</i>
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 grid place-items-center gap-2 bg-black/65">
            <span className="flex flex-col items-center gap-2">
              <span className="text-[15px] font-bold tabular-nums text-white">
                {progress > 0 ? `${progress}%` : "…"}
              </span>
              {/* A determinate bar: video uploads run long enough that a
                  spinner alone reads as a hang. */}
              <span className="block h-1 w-32 overflow-hidden rounded-full bg-white/25">
                <span
                  className="block h-full rounded-full bg-white transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </span>
              <i className="not-italic text-[10.5px] text-white/70">
                {progress >= 100 ? "Processing…" : "Uploading…"}
              </i>
            </span>
          </span>
        )}
      </button>

      {value && !busy && (
        <div className="mt-[7px] flex gap-3">
          <button
            type="button"
            className={`${linkBtn} text-accent`}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </button>
          <a
            className={`${linkBtn} text-muted hover:text-ink`}
            href={videoStream(value)}
            target="_blank"
            rel="noreferrer"
          >
            Preview
          </a>
          <button
            type="button"
            className={`${linkBtn} text-muted hover:text-[var(--bad)]`}
            onClick={() => {
              // Empty string, not undefined — the API reads "" as "remove it".
              onChange("");
              onDurationDetected?.("");
            }}
          >
            Remove
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className={styles.input}
        onChange={pick}
        tabIndex={-1}
      />
    </div>
  );
};
