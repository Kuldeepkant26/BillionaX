import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore.js";
import { avatarUrl, uploadToCloudinary, validateImageFile } from "../../utils/upload.js";
import styles from "./LogoUpload.module.css";

/**
 * The hotel's logo, uploaded straight to Cloudinary from the browser.
 *
 * Unlike the guest avatar this does NOT save on its own — it hands the URL up
 * via `onChange` so it is written by the settings form's single Save. Uploading
 * and saving separately would let a manager upload a logo, close the page, and
 * find it had not stuck.
 */
// The two text links share everything but their colour.
const linkBtn =
  "border-0 bg-none p-0 font-[inherit] text-[11.5px] font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-progress";

export const LogoUpload = ({ value, name, onChange, getSignature }) => {
  const inputRef = useRef(null);
  const toastError = useAppStore((s) => s.toastError);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const shown = preview || (value ? avatarUrl(value, 96) : null);
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";

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
    <div className="flex items-center gap-3.5">
      <button
        type="button"
        className={`relative w-16 h-16 flex-none p-0 border border-hairline rounded-token-sm overflow-hidden cursor-pointer disabled:cursor-progress grid place-items-center ${styles.thumb}`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={value ? "Change hotel logo" : "Add a hotel logo"}
      >
        {shown ? (
          <img src={shown} alt="" className="w-full h-full object-cover block" />
        ) : (
          <span className="font-display text-2xl font-semibold text-white">{initial}</span>
        )}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-black/55">
            <span className="text-[11px] font-bold text-white tabular-nums">
              {progress > 0 ? `${progress}%` : "…"}
            </span>
          </span>
        )}
      </button>

      <div className="min-w-0">
        <b className="block text-[12.5px] font-semibold">Hotel logo</b>
        <span className="block text-[11.5px] text-muted mt-0.5 leading-[1.45]">
          Square works best. JPG, PNG or WEBP, up to 5MB.
        </span>
        <div className="flex gap-3 mt-[7px]">
          <button
            type="button"
            className={`${linkBtn} text-accent`}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            {value ? "Replace" : "Upload"}
          </button>
          {value && !busy && (
            <button
              type="button"
              className={`${linkBtn} text-muted hover:text-[var(--bad)]`}
              onClick={() => {
                setPreview(null);
                onChange("");
              }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

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
