import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore.js";
import { avatarUrl, uploadToCloudinary, validateImageFile } from "../../utils/upload.js";
import styles from "./ImagePicker.module.css";

/**
 * Pick-and-upload replacement for the old "paste an image URL" inputs.
 *
 * The file goes browser → Cloudinary via a signature the API issues; only the
 * resulting URL is handed up through `onChange`. It does NOT save on its own —
 * the parent form's Save writes it, so an upload followed by a cancel leaves
 * the record untouched.
 *
 * Replacing an existing image does not delete the old asset here: that happens
 * server-side once the new URL is actually saved. Deleting on pick would lose
 * the picture if the manager then cancelled the form.
 */
// The two text links share everything but their colour.
const linkBtn =
  "border-0 bg-none p-0 font-[inherit] text-[11.5px] font-semibold cursor-pointer";

export const ImagePicker = ({
  value,
  onChange,
  getSignature,
  label = "Image",
  hint = "JPG, PNG or WEBP, up to 5MB.",
  aspect = "wide",
}) => {
  const inputRef = useRef(null);
  const toastError = useAppStore((s) => s.toastError);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const shown = preview || (value ? avatarUrl(value, 320) : null);

  const pick = (event) => {
    const file = event.target.files?.[0];
    // Reset first, or re-picking the same file after an error fires no event.
    event.target.value = "";
    if (!file) return;

    const problem = validateImageFile(file);
    if (problem) return toastError(problem);

    upload(file);
  };

  const upload = async (file) => {
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);
    setProgress(0);

    try {
      const signed = await getSignature();
      const uploaded = await uploadToCloudinary(file, signed, setProgress);
      onChange(uploaded);
    } catch (err) {
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      toastError(err.message || "Could not upload that image");
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
          styles[aspect]
        } ${
          // Solid once there is an image: a dashed border around a real picture
          // reads as a placeholder that failed to fill.
          shown ? "border-solid bg-surface" : "border-dashed bg-chip"
        } border-hairline`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={value ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      >
        {shown ? (
          <img src={shown} alt="" className="w-full h-full object-cover block" />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-[3px] text-muted p-3 text-center">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M4 17.5V6.5h16v11z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <circle cx="9" cy="10.5" r="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="M5 16l4-4 3 3 3.5-3.5L19 15.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <b className="text-[12.5px] font-semibold text-ink mt-1">Choose an image</b>
            <i className="not-italic text-[11px] leading-[1.4]">{hint}</i>
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/55">
            <span className="text-[13px] font-bold text-white tabular-nums">
              {progress > 0 ? `${progress}%` : "…"}
            </span>
          </span>
        )}
      </button>

      {shown && !busy && (
        <div className="flex gap-3 mt-[7px]">
          <button
            type="button"
            className={`${linkBtn} text-accent`}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </button>
          <button
            type="button"
            className={`${linkBtn} text-muted hover:text-[var(--bad)]`}
            onClick={() => {
              setPreview(null);
              // Empty string, not undefined — the API reads "" as "remove it".
              onChange("");
            }}
          >
            Remove
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.input}
        onChange={pick}
        tabIndex={-1}
      />
    </div>
  );
};
