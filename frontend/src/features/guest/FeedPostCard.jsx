import { useState } from "react";
import { Link } from "react-router-dom";
import { avatarUrl } from "../../utils/upload.js";
import { initials, timeAgo } from "../../utils/format.js";
import { feedPostPath, feedProfilePath } from "../../constants/routePaths.js";
import { FeedCarousel } from "./FeedCarousel.jsx";
import { VerifiedTick } from "./VerifiedTick.jsx";
import styles from "./FeedPostCard.module.css";

/**
 * One post in the feed.
 *
 * Interactions are OPTIMISTIC: the heart fills on tap and the server's
 * authoritative count is applied when it answers. A like that waits for a round
 * trip feels broken on hotel wifi, and the count is read back server-side so
 * the correction is always right.
 *
 * The parent owns the row (see useFeedList.patchPost) — this component reports
 * what happened and renders what it is given, so the same card works in the
 * feed, on a profile and in a panel.
 */

/**
 * Author avatar, falling back to initials.
 *
 * The fallback is not decoration: this Cloudinary account has strict
 * transformations enabled, so a derived URL can 404 even when the original is
 * fine (VideoComments documents the same hazard). A hole in the row is worse
 * than the letters.
 */
const Avatar = ({ name, url, size = 32 }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {url && !broken ? (
        <img src={avatarUrl(url, size * 2)} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span style={{ fontSize: size * 0.36 }}>{initials(name)}</span>
      )}
    </span>
  );
};

const Icon = ({ d, filled = false, size = 23 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"
    fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const HEART =
  "M12 20.5l-1.4-1.3C5.6 14.7 2.5 11.9 2.5 8.5A4.6 4.6 0 0 1 7.1 3.9c1.6 0 3.1.7 4.9 2.6 1.8-1.9 3.3-2.6 4.9-2.6a4.6 4.6 0 0 1 4.6 4.6c0 3.4-3.1 6.2-8.1 10.7z";
const BUBBLE = "M21 11.5a8.4 8.4 0 0 1-9 8.4 9.7 9.7 0 0 1-3.6-.7L3 21l1.9-5A8.3 8.3 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z";
const BOOKMARK = "M18 21l-6-4.4L6 21V4.6A1.6 1.6 0 0 1 7.6 3h8.8A1.6 1.6 0 0 1 18 4.6z";
const DOTS = "M6 12h.01M12 12h.01M18 12h.01";

export const FeedPostCard = ({
  post,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onOpenLikes,
  onDelete,
  canDelete = false,
  showCaption = true,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!post) return null;
  const { author = {} } = post;
  // Long captions collapse to two lines. 110 is where the clamp actually bites
  // at this width, so a shorter caption never shows a pointless "more".
  const longCaption = (post.caption || "").length > 110;

  return (
    <article className={styles.card}>
      <header className={styles.head}>
        <Link to={feedProfilePath(author.id)} className={styles.who}>
          <Avatar name={author.name} url={author.avatarUrl} />
          <span className={styles.whoText}>
            <b>
              {author.name}
              {author.isVerified && <VerifiedTick />}
            </b>
            <i>{timeAgo(post.createdAt)}</i>
          </span>
        </Link>

        {canDelete && (
          <span className={styles.menuWrap}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Post options"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <Icon d={DOTS} size={20} />
            </button>
            {menuOpen && (
              <>
                {/* Full-screen catcher so a tap anywhere closes the menu —
                    cheaper and more reliable on touch than a blur handler. */}
                <button
                  type="button"
                  className={styles.scrim}
                  aria-label="Close menu"
                  onClick={() => setMenuOpen(false)}
                />
                <span className={styles.menu}>
                  <button
                    type="button"
                    className={styles.menuDanger}
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete?.(post);
                    }}
                  >
                    Delete post
                  </button>
                </span>
              </>
            )}
          </span>
        )}
      </header>

      <FeedCarousel images={post.images} alt={post.caption || `Post by ${author.name}`} />

      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => onToggleLike?.(post)}
          className={post.likedByMe ? styles.liked : styles.action}
          aria-pressed={Boolean(post.likedByMe)}
          aria-label={post.likedByMe ? "Unlike" : "Like"}
        >
          <Icon d={HEART} filled={Boolean(post.likedByMe)} />
        </button>

        <button
          type="button"
          onClick={() => onOpenComments?.(post)}
          className={styles.action}
          aria-label="Comments"
        >
          <Icon d={BUBBLE} />
        </button>

        <button
          type="button"
          onClick={() => onToggleSave?.(post)}
          className={`${post.savedByMe ? styles.saved : styles.action} ${styles.pushRight}`}
          aria-pressed={Boolean(post.savedByMe)}
          aria-label={post.savedByMe ? "Remove from saved" : "Save"}
        >
          <Icon d={BOOKMARK} filled={Boolean(post.savedByMe)} />
        </button>
      </div>

      <div className={styles.body}>
        {post.likeCount > 0 && (
          // The count is the way in to who liked it, the way it is everywhere
          // else. A separate "see likes" link would be a second control for
          // something the number already names.
          <button type="button" className={styles.likes} onClick={() => onOpenLikes?.(post)}>
            {post.likeCount.toLocaleString()} {post.likeCount === 1 ? "like" : "likes"}
          </button>
        )}

        {showCaption && post.caption && (
          <p className={expanded ? styles.caption : styles.captionClamped}>
            <Link to={feedProfilePath(author.id)} className={styles.captionName}>
              {author.name}
            </Link>{" "}
            {post.caption}
          </p>
        )}

        {showCaption && longCaption && !expanded && (
          <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
            more
          </button>
        )}

        {post.commentCount > 0 ? (
          <button type="button" className={styles.viewAll} onClick={() => onOpenComments?.(post)}>
            View all {post.commentCount} comment{post.commentCount === 1 ? "" : "s"}
          </button>
        ) : (
          <button type="button" className={styles.viewAll} onClick={() => onOpenComments?.(post)}>
            Add a comment
          </button>
        )}

        <Link to={feedPostPath(post.id)} className={styles.permalink}>
          View post
        </Link>
      </div>
    </article>
  );
};

export default FeedPostCard;
