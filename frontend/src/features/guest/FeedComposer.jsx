import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createFeedImageUpload, createPost } from "../../api/feed.api.js";
import { invalidateCache } from "../../hooks/asyncCache.js";
import { useAppStore } from "../../store/useAppStore.js";
import { MultiImagePicker } from "../panel/MultiImagePicker.jsx";
import { Button } from "../../components/common/index.jsx";
import styles from "./FeedCommentSheet.module.css";

const MAX_CAPTION = 2200;

/**
 * Create a post: pick up to ten images, write a caption, publish.
 *
 * Shares the comment sheet's chrome — same portal, same bottom-anchored panel —
 * because they are the same kind of surface and two stylesheets would drift.
 */
export const FeedComposer = ({ onClose, onPosted }) => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const [images, setImages] = useState([]);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !posting && onClose?.();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, posting]);

  const submit = async () => {
    if (!images.length || posting) return;
    setPosting(true);
    try {
      await createPost({ images, caption: caption.trim() });
      // Broad on purpose: a new post belongs in the feed, the author's profile,
      // their panel list and the moderation table all at once.
      invalidateCache("feed.");
      toastSuccess("Posted");
      onPosted?.();
    } catch (error) {
      toastError(error.message || "Could not publish that post");
    } finally {
      setPosting(false);
    }
  };

  const host = document.getElementById("modal-root") || document.body;

  return createPortal(
    <div
      className={styles.back}
      onMouseDown={(e) => e.target === e.currentTarget && !posting && onClose?.()}
    >
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Create a post">
        <header className={styles.head}>
          <span className={styles.grab} aria-hidden="true" />
          <h3>New post</h3>
          <button type="button" onClick={onClose} aria-label="Close" disabled={posting}>
            ×
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto pt-1">
          <MultiImagePicker
            value={images}
            onChange={setImages}
            getSignature={createFeedImageUpload}
          />

          <label className="block mt-4">
            <span className="label">Caption</span>
            <textarea
              className="input"
              rows={4}
              value={caption}
              maxLength={MAX_CAPTION}
              placeholder="Say something about it…"
              onChange={(e) => setCaption(e.target.value)}
              style={{ height: "auto", resize: "vertical" }}
            />
          </label>
          {/* Only shown near the cap: a counter on an empty box is noise. */}
          {caption.length > MAX_CAPTION - 200 && (
            <p className="text-[11px] text-muted mt-1 mb-0 text-right tabular-nums">
              {MAX_CAPTION - caption.length} left
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-3 pb-1">
          <Button variant="ghost" onClick={onClose} disabled={posting} className="flex-1">
            Cancel
          </Button>
          <Button onClick={submit} disabled={!images.length || posting} className="flex-1">
            {posting ? "Posting…" : "Share"}
          </Button>
        </div>
      </div>
    </div>,
    host
  );
};

export default FeedComposer;
