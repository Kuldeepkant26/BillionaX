import { useEffect } from "react";
import { createPortal } from "react-dom";
import { FeedComments } from "./FeedComments.jsx";
import styles from "./FeedCommentSheet.module.css";

/**
 * The comment thread as a bottom sheet.
 *
 * Its own portal rather than the shared Modal: that component centres a card
 * and owns its header, and a sheet has to be anchored to the bottom edge and
 * sized against the viewport so the on-screen keyboard does not push the
 * composer out of reach. Reusing it would have meant overriding nearly every
 * rule it sets.
 *
 * It portals into the same #modal-root, which lives inside the themed wrapper,
 * so the sheet keeps the active theme's variables.
 */
export const FeedCommentSheet = ({ post, onClose, onCountChange }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll while the sheet is open, or a swipe
    // meant for the thread drags the feed instead.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (!post) return null;
  const host = document.getElementById("modal-root") || document.body;

  return createPortal(
    <div
      className={styles.back}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="Comments">
        <header className={styles.head}>
          <span className={styles.grab} aria-hidden="true" />
          <h3>Comments</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <FeedComments
          postId={post.id}
          postAuthorId={post.author?.id}
          onCountChange={onCountChange}
        />
      </div>
    </div>,
    host
  );
};

export default FeedCommentSheet;
