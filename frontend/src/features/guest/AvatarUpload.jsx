import { useEffect, useRef, useState } from "react";
import { createAvatarUpload, updateProfile } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { avatarUrl, uploadToCloudinary, validateImageFile } from "../../utils/upload.js";
import styles from "./AvatarUpload.module.css";

/**
 * Tap-to-change profile picture.
 *
 * The file goes straight from the browser to Cloudinary using a signature the
 * API issues per upload — it never passes through our server. Only once
 * Cloudinary returns a URL is the profile saved, so a failed upload leaves the
 * old picture untouched.
 */
export const AvatarUpload = ({ user }) => {
  const inputRef = useRef(null);
  const setUser = useAppStore((s) => s.setUser);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  // A local object URL, so the new picture appears the instant it is chosen
  // rather than after the round trip.
  const [preview, setPreview] = useState(null);

  // Object URLs leak until revoked, and this component outlives several picks.
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const initial = (user?.name || "?").trim().charAt(0).toUpperCase() || "?";
  const shown = preview || (user?.avatarUrl ? avatarUrl(user.avatarUrl, 128) : null);

  const pick = (event) => {
    const file = event.target.files?.[0];
    // Reset immediately, or picking the SAME file twice after an error fires
    // no change event and the retry silently does nothing.
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
      const signed = await createAvatarUpload();
      const uploaded = await uploadToCloudinary(file, signed, setProgress);
      const { user: saved } = await updateProfile({ avatarUrl: uploaded });

      setUser(saved);
      toastSuccess("Profile picture updated");
    } catch (err) {
      // Drop the preview so the avatar snaps back to what is actually saved,
      // rather than showing a picture that was never stored.
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      toastError(err.message || "Could not update your picture");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { user: saved } = await updateProfile({ avatarUrl: "" });
      setPreview(null);
      setUser(saved);
      toastSuccess("Profile picture removed");
    } catch (err) {
      toastError(err.message || "Could not remove your picture");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-col items-center gap-[5px] flex-none">
      <button
        type="button"
        className={`relative w-[54px] h-[54px] p-0 border-0 rounded-2xl overflow-hidden cursor-pointer disabled:cursor-progress grid place-items-center flex-none ${styles.button}`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={user?.avatarUrl ? "Change your profile picture" : "Add a profile picture"}
      >
        {shown ? (
          <img src={shown} alt="" className="w-full h-full object-cover block" />
        ) : (
          <span className="font-display text-[21px] font-semibold text-white">{initial}</span>
        )}

        {/* A small camera mark, so the avatar reads as tappable rather than
            decorative — without it nobody discovers they can change it. */}
        <span
          className="absolute right-0.5 bottom-0.5 w-[18px] h-[18px] rounded-full grid place-items-center bg-surface text-ink border border-hairline"
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" width="11" height="11">
            <path
              d="M3.5 6.5h3l1-1.6h5l1 1.6h3v9h-13z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="10.6" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
          </svg>
        </span>

        {busy && (
          <span className={`absolute inset-0 grid place-items-center bg-black/55 ${styles.overlay}`}>
            <span className="text-[11px] font-bold text-white tabular-nums">
              {progress > 0 ? `${progress}%` : "…"}
            </span>
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className={styles.input}
        onChange={pick}
        tabIndex={-1}
      />

      {user?.avatarUrl && !busy && (
        <button
          type="button"
          className="border-0 bg-none p-0 font-[inherit] text-[10.5px] font-semibold text-muted hover:text-[var(--bad)] cursor-pointer"
          onClick={remove}
        >
          Remove
        </button>
      )}
    </span>
  );
};
