import { useEffect, useRef, useState } from "react";
import {
  addVideoComment,
  deleteVideoComment,
  listCommentReplies,
  listVideoComments,
  toggleCommentLike,
} from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { initials, timeAgo } from "../../utils/format.js";
import styles from "./VideoComments.module.css";

/**
 * The comment thread under a video.
 *
 * Two things drive the shape. The thread is a FIXED-HEIGHT scroll region rather
 * than a list that grows the page: an unbounded list pushes the up-next rail an
 * arbitrary distance down, so the more popular a video is the harder the rest of
 * the screen is to reach. And pagination happens INSIDE that region, so "load
 * more" never moves the scroll position of anything above it.
 *
 * Replies are one level deep and fetched on expand — see listReplies on the
 * server for why.
 */

const PAGE = 10;

/**
 * Author identity. The hotel's own logo replaces the initials on staff rows.
 *
 * Falls back to initials when the image fails rather than leaving a blank
 * circle: this Cloudinary account has strict transformations enabled, so a
 * derived URL can 404 even when the original is fine, and a hole in the thread
 * is worse than the letters. The URL is used as stored for the same reason.
 */
const Avatar = ({ name, url, size = 32, badge = false }) => {
  const [broken, setBroken] = useState(false);
  const px = { width: size, height: size };
  return (
    <span className={styles.avatarWrap} style={px}>
      {url && !broken ? (
        <img
          src={url}
          alt=""
          className={styles.avatarImg}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className={styles.avatarFallback}
          style={{ fontSize: size * 0.34 }}
        >
          {initials(name)}
        </span>
      )}
      {badge && (
        <span className={styles.hostDot} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="9" height="9" fill="#fff">
            <path d="M9.6 16.6 5 12l1.4-1.4 3.2 3.2 8-8L19 7.2z" />
          </svg>
        </span>
      )}
    </span>
  );
};

const HeartIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
    <path
      d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The shared composer, used for the top-level box and for every reply box.
 *
 * autoFocus only when replying: stealing focus on mount would scroll a phone to
 * the comment box the moment the page opened.
 */
const Composer = ({
  value,
  onChange,
  onSubmit,
  onCancel,
  busy,
  placeholder,
  avatar,
  autoFocus = false,
  compact = false,
}) => {
  const ref = useRef(null);

  // Height follows the text so what you just typed is never scrolled out of a
  // fixed box. Runs on value too, so clearing the draft collapses it back.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <form
      className={`${styles.composerRow} ${compact ? styles.composerCompact : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {avatar}
      <div className={styles.composerBody}>
        <textarea
          ref={ref}
          className={styles.composerInput}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={1}
          maxLength={600}
          autoFocus={autoFocus}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line — the grammar of every
            // chat box. Escape backs out of a reply.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (value.trim() && !busy) onSubmit();
            } else if (e.key === "Escape" && onCancel) {
              onCancel();
            }
          }}
        />
        {(value.trim() || autoFocus) && (
          <div className={styles.composerActions}>
            <span className={styles.counter}>{600 - value.length}</span>
            {onCancel && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              className="btn btn-sm"
              disabled={busy || !value.trim()}
            >
              {busy ? "Posting…" : "Comment"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
};

/**
 * One comment, plus its reply affordances.
 *
 * A reply row is the same component with `isReply` — the only differences are a
 * smaller avatar and no reply button of its own, since threading stops here.
 */
const CommentRow = ({
  comment,
  isReply = false,
  isMine,
  hotel,
  onLike,
  onDelete,
  onToggleReplies,
  repliesOpen,
  replyBusy,
  children,
}) => {
  // A comment written by the account that owns the hotel wears the hotel's
  // logo and name, the way a channel's own reply does on a video app.
  const isHost = Boolean(comment.author?.isHost);
  const name = isHost
    ? hotel?.name || comment.author?.name
    : comment.author?.name;
  const photo = isHost
    ? hotel?.logoUrl || comment.author?.avatarUrl
    : comment.author?.avatarUrl;

  return (
    <li className={`${styles.row} ${isReply ? styles.rowReply : ""}`}>
      <Avatar name={name} url={photo} size={isReply ? 26 : 32} badge={isHost} />

      <div className={styles.rowBody}>
        <div className={styles.rowHead}>
          <b className={`${styles.author} ${isHost ? styles.authorHost : ""}`}>
            {name}
          </b>
          {isHost && <span className={styles.hostTag}>Host</span>}
          <i className={styles.stamp}>{timeAgo(comment.createdAt)}</i>
        </div>

        <p className={styles.text}>{comment.body}</p>

        <div className={styles.rowActions}>
          <button
            type="button"
            onClick={() => onLike(comment)}
            aria-pressed={comment.likedByMe}
            aria-label={
              comment.likedByMe ? "Unlike this comment" : "Like this comment"
            }
            className={`${styles.iconBtn} ${comment.likedByMe ? styles.iconBtnOn : ""}`}
          >
            <HeartIcon filled={comment.likedByMe} />
            {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
          </button>

          {!isReply && (
            <button
              type="button"
              className={styles.textBtn}
              onClick={() => onToggleReplies(comment)}
            >
              Reply
            </button>
          )}

          {isMine && (
            <button
              type="button"
              className={`${styles.textBtn} ${styles.textBtnDanger}`}
              onClick={() => onDelete(comment)}
            >
              Delete
            </button>
          )}
        </div>

        {!isReply && comment.replyCount > 0 && (
          <button
            type="button"
            className={styles.repliesToggle}
            onClick={() => onToggleReplies(comment, true)}
          >
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              aria-hidden="true"
              className={repliesOpen ? styles.caretOpen : ""}
              fill="currentColor"
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
            {comment.replyCount === 1
              ? "1 reply"
              : `${comment.replyCount} replies`}
            {replyBusy && <span className={styles.dots} aria-hidden="true" />}
          </button>
        )}

        {children}
      </div>
    </li>
  );
};

export const VideoComments = ({
  hotelId,
  contentId,
  hotel,
  total,
  onCountChange,
}) => {
  const user = useAppStore((s) => s.user);
  const toastError = useAppStore((s) => s.toastError);
  const myId = String(user?.id || user?._id || "");

  const [comments, setComments] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  // Reply state, keyed by parent id so two open threads never share a draft.
  const [replies, setReplies] = useState({});
  const [openReplies, setOpenReplies] = useState({});
  const [loadingReplies, setLoadingReplies] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyPosting, setReplyPosting] = useState(false);

  const scrollRef = useRef(null);
  // Whether the thread has more below the fold, which drives the bottom fade.
  const [canScrollMore, setCanScrollMore] = useState(false);

  /**
   * Recomputes the fade. Called on scroll and whenever the list changes, since
   * loading a page or opening replies changes the height under the viewport.
   */
  const syncFade = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };

  useEffect(syncFade, [comments, replies, openReplies, loading]);

  // No setLoading(true) here: `loading` starts true and the whole watch screen
  // is keyed on the video id, so a different video remounts this component
  // with fresh state rather than re-running against stale state.
  useEffect(() => {
    let cancelled = false;

    listVideoComments(hotelId, contentId, { limit: PAGE })
      .then((res) => {
        if (cancelled) return;
        setComments(res.items || []);
        setHasMore(Boolean(res.hasMore));
        setPage(1);
      })
      .catch(() => {
        // The video is still watchable without its comments.
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [hotelId, contentId]);

  /**
   * Appends the next page.
   *
   * The scroll container is NOT touched: new rows land below the fold of the
   * region and the guest keeps reading where they were, which is the whole
   * reason pagination lives inside the box.
   */
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await listVideoComments(hotelId, contentId, {
        page: next,
        limit: PAGE,
      });
      // De-duplicated by id: a comment posted between two page fetches would
      // otherwise shift the offset and repeat a row.
      setComments((list) => {
        const seen = new Set(list.map((c) => c.id));
        return [...list, ...(res.items || []).filter((c) => !seen.has(c.id))];
      });
      setPage(next);
      setHasMore(Boolean(res.hasMore));
    } catch (err) {
      toastError(err.message || "Could not load more comments");
    } finally {
      setLoadingMore(false);
    }
  };

  /** Optimistic like on a top-level comment or a reply, reverted on failure. */
  const likeComment = async (comment) => {
    const optimistic = (c) => ({
      ...c,
      likedByMe: !c.likedByMe,
      likeCount: c.likeCount + (c.likedByMe ? -1 : 1),
    });

    const apply = (updater) => {
      if (comment.parentId) {
        setReplies((map) => ({
          ...map,
          [comment.parentId]: (map[comment.parentId] || []).map((c) =>
            c.id === comment.id ? updater(c) : c,
          ),
        }));
      } else {
        setComments((list) =>
          list.map((c) => (c.id === comment.id ? updater(c) : c)),
        );
      }
    };

    apply(optimistic);

    try {
      const res = await toggleCommentLike(hotelId, comment.id);
      apply((c) => ({
        ...c,
        likeCount: res.likeCount,
        likedByMe: res.likedByMe,
      }));
    } catch (err) {
      apply(() => comment);
      toastError(err.message || "Could not save that");
    }
  };

  /**
   * Opens or closes a reply thread, fetching it the first time.
   *
   * `showOnly` comes from the "N replies" toggle, which should only expand and
   * collapse; the Reply button also opens the composer.
   */
  const toggleReplies = async (comment, showOnly = false) => {
    const id = comment.id;
    const isOpen = openReplies[id];

    if (!showOnly) setReplyTo(isOpen && replyTo === id ? null : id);
    if (!showOnly) setReplyDraft("");

    if (isOpen && showOnly) {
      setOpenReplies((m) => ({ ...m, [id]: false }));
      return;
    }

    setOpenReplies((m) => ({ ...m, [id]: true }));

    // Cached after the first open — reopening a thread should not re-fetch.
    if (replies[id] || comment.replyCount === 0) return;

    setLoadingReplies((m) => ({ ...m, [id]: true }));
    try {
      const res = await listCommentReplies(hotelId, id);
      setReplies((m) => ({ ...m, [id]: res.items || [] }));
    } catch (err) {
      toastError(err.message || "Could not load replies");
      setOpenReplies((m) => ({ ...m, [id]: false }));
    } finally {
      setLoadingReplies((m) => ({ ...m, [id]: false }));
    }
  };

  const submitComment = async () => {
    const body = draft.trim();
    if (!body || posting) return;

    setPosting(true);
    try {
      const res = await addVideoComment(hotelId, contentId, body);
      setComments((list) => [res.comment, ...list]);
      setDraft("");
      onCountChange?.(1);
      // The new comment is at the top of the region, so show it.
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toastError(err.message || "Could not post that comment");
    } finally {
      setPosting(false);
    }
  };

  const submitReply = async (parentId) => {
    const body = replyDraft.trim();
    if (!body || replyPosting) return;

    setReplyPosting(true);
    try {
      const res = await addVideoComment(hotelId, contentId, body, parentId);
      setReplies((m) => ({
        ...m,
        [parentId]: [...(m[parentId] || []), res.comment],
      }));
      setComments((list) =>
        list.map((c) =>
          c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c,
        ),
      );
      setOpenReplies((m) => ({ ...m, [parentId]: true }));
      setReplyDraft("");
      setReplyTo(null);
      onCountChange?.(1);
    } catch (err) {
      toastError(err.message || "Could not post that reply");
    } finally {
      setReplyPosting(false);
    }
  };

  const removeComment = async (comment) => {
    const parentId = comment.parentId;
    const previousComments = comments;
    const previousReplies = replies;

    // A top-level comment takes its replies with it, matching the server.
    const goneCount = parentId
      ? 1
      : 1 + (replies[comment.id]?.length ?? comment.replyCount ?? 0);

    if (parentId) {
      setReplies((m) => ({
        ...m,
        [parentId]: (m[parentId] || []).filter((c) => c.id !== comment.id),
      }));
      setComments((list) =>
        list.map((c) =>
          c.id === parentId
            ? { ...c, replyCount: Math.max(0, c.replyCount - 1) }
            : c,
        ),
      );
    } else {
      setComments((list) => list.filter((c) => c.id !== comment.id));
    }

    try {
      await deleteVideoComment(comment.id);
      onCountChange?.(-goneCount);
    } catch (err) {
      setComments(previousComments);
      setReplies(previousReplies);
      toastError(err.message || "Could not remove that comment");
    }
  };

  const myAvatar = <Avatar name={user?.name} url={user?.avatarUrl} size={32} />;
  const heading =
    total > 0 ? `${total} ${total === 1 ? "comment" : "comments"}` : "Comments";

  return (
    <section id="comments" className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.heading}>{heading}</h2>
      </div>

      {/* The composer sits OUTSIDE the scroll region: it must stay reachable
          no matter how far down the thread the guest has read. */}
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submitComment}
        busy={posting}
        placeholder="Add a comment…"
        avatar={myAvatar}
      />

      <div className={styles.scrollFrame}>
        <div
          className={`${styles.scroller} ${canScrollMore ? styles.scrollerFaded : ""}`}
          ref={scrollRef}
          onScroll={syncFade}
        >
          {loading ? (
            <ul className={styles.list}>
              {[0, 1, 2].map((i) => (
                <li key={i} className={styles.skeletonRow} aria-hidden="true">
                  <span className={styles.skeletonAvatar} />
                  <span className={styles.skeletonLines}>
                    <span
                      className={styles.skeletonLine}
                      style={{ width: "34%" }}
                    />
                    <span
                      className={styles.skeletonLine}
                      style={{ width: "88%" }}
                    />
                    <span
                      className={styles.skeletonLine}
                      style={{ width: "62%" }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : comments.length === 0 ? (
            <p className={styles.empty}>
              No comments yet — say something first.
            </p>
          ) : (
            <>
              <ul className={styles.list}>
                {comments.map((comment) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    hotel={hotel}
                    isMine={comment.author?.id === myId}
                    onLike={likeComment}
                    onDelete={removeComment}
                    onToggleReplies={toggleReplies}
                    repliesOpen={Boolean(openReplies[comment.id])}
                    replyBusy={Boolean(loadingReplies[comment.id])}
                  >
                    {openReplies[comment.id] && (
                      <div className={styles.replyBlock}>
                        {(replies[comment.id] || []).length > 0 && (
                          <ul className={styles.replyList}>
                            {replies[comment.id].map((reply) => (
                              <CommentRow
                                key={reply.id}
                                comment={reply}
                                isReply
                                hotel={hotel}
                                isMine={reply.author?.id === myId}
                                onLike={likeComment}
                                onDelete={removeComment}
                                onToggleReplies={toggleReplies}
                              />
                            ))}
                          </ul>
                        )}

                        {replyTo === comment.id && (
                          <Composer
                            compact
                            autoFocus
                            value={replyDraft}
                            onChange={setReplyDraft}
                            onSubmit={() => submitReply(comment.id)}
                            onCancel={() => {
                              setReplyTo(null);
                              setReplyDraft("");
                            }}
                            busy={replyPosting}
                            placeholder={`Reply to ${comment.author?.name || "this comment"}…`}
                            avatar={
                              <Avatar
                                name={user?.name}
                                url={user?.avatarUrl}
                                size={26}
                              />
                            }
                          />
                        )}
                      </div>
                    )}
                  </CommentRow>
                ))}
              </ul>

              {/* Pagination inside the scroll region, so loading more never
                moves anything the guest is already looking at. */}
              {hasMore && (
                <button
                  type="button"
                  className={styles.loadMore}
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? "Loading…" : `Load ${PAGE} more comments`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
