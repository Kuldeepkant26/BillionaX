import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { listPostLikes } from "../../api/feed.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { avatarUrl } from "../../utils/upload.js";
import { initials, timeAgo } from "../../utils/format.js";
import { feedProfilePath } from "../../constants/routePaths.js";
import { VerifiedTick } from "./VerifiedTick.jsx";
import { Empty, ErrorState, Spinner } from "../../components/common/index.jsx";
import sheet from "./FeedCommentSheet.module.css";
import styles from "./LikesSheet.module.css";

/**
 * Who liked a post.
 *
 * Shares the comment sheet's chrome, because it is the same kind of surface —
 * a list that comes up from the bottom over the feed — and two stylesheets for
 * one shape would drift apart the first time either was touched.
 *
 * Each row links to that person's profile, so "who liked this" leads somewhere
 * rather than being a dead list of names.
 */
const Row = ({ person, onNavigate }) => {
  const [broken, setBroken] = useState(false);

  return (
    <li>
      <Link to={feedProfilePath(person.id)} className={styles.row} onClick={onNavigate}>
        <span className={styles.avatar}>
          {person.avatarUrl && !broken ? (
            <img
              src={avatarUrl(person.avatarUrl, 80)}
              alt=""
              loading="lazy"
              onError={() => setBroken(true)}
            />
          ) : (
            <span>{initials(person.name)}</span>
          )}
        </span>
        <span className={styles.who}>
          <b>
            {person.name}
            {person.isVerified && <VerifiedTick size={11} />}
          </b>
          <i>{timeAgo(person.likedAt)}</i>
        </span>
      </Link>
    </li>
  );
};

export const LikesSheet = ({ post, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const { data, error, loading, run } = useAsync(
    () => listPostLikes(post.id, { limit: 50 }),
    [post.id],
    { cacheKey: "feed.postLikes" }
  );

  if (!post) return null;
  const host = document.getElementById("modal-root") || document.body;
  const items = data?.items || [];

  return createPortal(
    <div className={sheet.back} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={sheet.sheet} role="dialog" aria-modal="true" aria-label="Likes">
        <header className={sheet.head}>
          <span className={sheet.grab} aria-hidden="true" />
          <h3>Likes</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.body}>
          {loading && !data ? (
            <Spinner />
          ) : error && !data ? (
            <ErrorState error={error} onRetry={run} />
          ) : !items.length ? (
            <Empty title="No likes yet" hint="Be the first." />
          ) : (
            // Navigating away closes the sheet, or it would sit over the
            // profile the reader just asked to see.
            <ul className={styles.list}>
              {items.map((p) => (
                <Row key={p.id} person={p} onNavigate={onClose} />
              ))}
            </ul>
          )}

          {data?.hasMore && (
            <p className={styles.more}>Showing the {items.length} most recent.</p>
          )}
        </div>
      </div>
    </div>,
    host
  );
};

export default LikesSheet;
