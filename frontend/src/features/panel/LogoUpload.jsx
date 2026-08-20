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
    <div className={styles.row}>
      <button
        type="button"
        className={styles.thumb}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={value ? "Change hotel logo" : "Add a hotel logo"}
      >
        {shown ? (
          <img src={shown} alt="" className={styles.image} />
        ) : (
          <span className={styles.initial}>{initial}</span>
        )}
        {busy && (
          <span className={styles.overlay}>
            <span className={styles.pct}>{progress > 0 ? `${progress}%` : "…"}</span>
          </span>
        )}
      </button>

      <div className={styles.meta}>
        <b>Hotel logo</b>
        <span>Square works best. JPG, PNG or WEBP, up to 5MB.</span>
        <div className={styles.links}>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
            {value ? "Replace" : "Upload"}
          </button>
          {value && !busy && (
            <button type="button" className={styles.danger} onClick={() => {
              setPreview(null);
              onChange("");
            }}>
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
