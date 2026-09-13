import { useRef, useState } from "react";
import { useAppStore } from "../../store/useAppStore.js";
import { feedImage, uploadToCloudinary, validateImageFile } from "../../utils/upload.js";
import styles from "./MultiImagePicker.module.css";

/**
 * Pick-and-upload for a carousel: `value` is an array of URLs, in display order.
 *
 * Takes the same injected `getSignature` prop as ImagePicker — the documented
 * way a new upload surface plugs in without this component knowing which
 * endpoint issues its credentials.
 *
 * Two things differ from ImagePicker beyond the cardinality:
 *
 * UPLOADS ARE SEQUENTIAL, not Promise.all. Ten parallel XHRs on hotel wifi is
 * how you get a timeout cascade, and one-at-a-time is what makes "3 of 7" an
 * honest progress line rather than seven bars moving at once.
 *
 * A PARTIAL FAILURE KEEPS WHAT SUCCEEDED. Nine good uploads are not thrown away
 * because the tenth timed out; the toast names the file that failed and the
 * rest stay picked.
 *
 * Previews use feedImage, NOT avatarUrl: avatarUrl is square and face-cropped,
 * so a landscape photo would preview as a square centred on a face that may not
 * be there — and would not match what actually posts.
 */
export const MultiImagePicker = ({ value = [], onChange, getSignature, max = 10 }) => {
  const inputRef = useRef(null);
  const toastError = useAppStore((s) => s.toastError);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);

  const remaining = max - value.length;

  const pick = async (event) => {
    const files = Array.from(event.target.files || []);
    // Reset first, or re-picking the same file after an error fires no event.
    event.target.value = "";
    if (!files.length) return;

    if (files.length > remaining) {
      toastError(
        remaining <= 0
          ? `A post can have at most ${max} images`
          : `You can add ${remaining} more image${remaining === 1 ? "" : "s"}`
      );
      return;
    }

    // Every file is checked BEFORE any signature is requested: rejecting the
    // fourth file after three uploads have already run wastes the quota and
    // leaves the post half-built.
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) return toastError(`${file.name}: ${problem}`);
    }

    setBusy(true);
    setTotal(files.length);
    setDone(0);

    const uploaded = [];
    try {
      for (const [i, file] of files.entries()) {
        setDone(i);
        setProgress(0);
        try {
          const signed = await getSignature();
          uploaded.push(await uploadToCloudinary(file, signed, setProgress));
        } catch (err) {
          // Stops at the first failure rather than pressing on: the usual cause
          // is the connection, so the remaining files would fail too and bury
          // the reader in identical toasts.
          toastError(
            `${file.name}: ${err.message || "upload failed"}${
              uploaded.length ? " — the images before it were kept" : ""
            }`
          );
          break;
        }
      }
      if (uploaded.length) onChange([...value, ...uploaded]);
    } finally {
      setBusy(false);
      setProgress(0);
      setTotal(0);
      setDone(0);
    }
  };

  const removeAt = (index) => onChange(value.filter((_, i) => i !== index));

  return (
    <div>
      <div className={styles.grid}>
        {value.map((url, i) => (
          <span key={url} className={styles.tile}>
            <img src={feedImage(url, 200)} alt="" loading="lazy" />
            <button
              type="button"
              className={styles.remove}
              onClick={() => removeAt(i)}
              aria-label={`Remove image ${i + 1}`}
              disabled={busy}
            >
              ×
            </button>
            {i === 0 && value.length > 1 && <i className={styles.cover}>Cover</i>}
          </span>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            className={styles.add}
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label="Add images"
          >
            {busy ? (
              <span className={styles.busy}>
                <b>{progress > 0 ? `${progress}%` : "…"}</b>
                {total > 1 && <i>{done + 1} of {total}</i>}
              </span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 6v12M6 12h12" />
                </svg>
                <i>Add</i>
              </>
            )}
          </button>
        )}
      </div>

      <p className={styles.hint}>
        {value.length}/{max} · JPG, PNG or WEBP, up to 5MB each.
        {value.length > 1 && " The first image is the cover."}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className={styles.input}
        onChange={pick}
        tabIndex={-1}
      />
    </div>
  );
};

export default MultiImagePicker;
