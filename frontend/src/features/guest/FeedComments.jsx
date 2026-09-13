import { useEffect, useRef, useState } from "react";
import {
  addPostComment,
  deleteFeedComment,
  listCommentReplies,
  listPostComments,
  toggleFeedCommentLike,
} from "../../api/feed.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { avatarUrl } from "../../utils/upload.js";
import { initials, timeAgo } from "../../utils/format.js";
import { VerifiedTick } from "./VerifiedTick.jsx";
import styles from "./FeedComments.module.css";

/**
 * The comment thread under a feed post.
 *
 * A FORK of VideoComments.jsx, not a reuse, and deliberately so. The
 * interaction logic there is hard-won and is copied almost verbatim —
 * optimistic likes with revert, reply state keyed by parent id, replies cached
 * after first open, de-duplicated pagination, and a delete that accounts for
 * the replies the server sweeps with it.
 *
 * What could not come across:
 *   - Its API calls are bound to (hotelId, contentId); a feed post has neither.
 *   - Its author badge is HOTEL-relative — it swaps in the hotel's logo and a
 *     "Host" tag. A hotel admin commenting here is commenting as THEMSELVES,
 *     so the badge is role-relative and keeps their own avatar.
 *   - Its fixed-height scroll region exists because the video page has an
 *     up-next rail below it. In a sheet the comments ARE the content.
 *
 * Making VideoComments generic would have meant rewriting a working screen to
 * serve a new one. Two files that share a shape is the cheaper trade.
 */

const PAGE = 10;

/**
 * Author identity. Falls back to initials when the image fails rather than
 * leaving a blank circle: this Cloudinary account has strict transformations
 * enabled, so a derived URL can 404 even when the original is fine.
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

const Composer = ({ value, onChange, onSubmit, busy, placeholder, avatar, autoFocus = false }) => (
  <form
    className={styles.composer}
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
  >
    {avatar}
    <input
      className={styles.input}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={600}
      autoFocus={autoFocus}
      aria-label={placeholder}
    />
    <button type="submit" className={styles.post} disabled={!value.trim() || busy}>
      {busy ? "…" : "Post"}
    </button>
  </form>
);

const HEART =
  "M12 20.5l-1.4-1.3C5.6 14.7 2.5 11.9 2.5 8.5A4.6 4.6 0 0 1 7.1 3.9c1.6 0 3.1.7 4.9 2.6 1.8-1.9 3.3-2.6 4.9-2.6a4.6 4.6 0 0 1 4.6 4.6c0 3.4-3.1 6.2-8.1 10.7z";

const Row = ({ comment, myId, onLike, onReply, onDelete, isReply = false, children }) => {
  const { author = {} } = comment;
  const mine = author.id && String(author.id) === myId;

  return (
    <li className={isReply ? styles.reply : styles.row}>
      <Avatar name={author.name} url={author.avatarUrl} size={isReply ? 26 : 32} />

      <div className={styles.rowBody}>
        <p className={styles.text}>
          <b>
            {author.name}
            {author.isVerified && <VerifiedTick size={11} />}
          </b>{" "}
          {comment.body}
        </p>

        <div className={styles.meta}>
          <i>{timeAgo(comment.createdAt)}</i>

          <button type="button" onClick={() => onLike(comment)} className={styles.metaBtn}>
            <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"
              fill={comment.likedByMe ? "var(--bad)" : "none"}
              stroke={comment.likedByMe ? "var(--bad)" : "currentColor"} strokeWidth="2">
              <path d={HEART} />
            </svg>
            {comment.likeCount > 0 && <span>{comment.likeCount}</span>}
          </button>

          {!isReply && (
            <button type="button" onClick={() => onReply(comment)} className={styles.metaBtn}>
              Reply
            </button>
          )}

          {(mine || onDelete.always) && (
            <button
              type="button"
              onClick={() => onDelete(comment)}
              className={`${styles.metaBtn} ${styles.danger}`}
            >
              Delete
            </button>
          )}
        </div>

        {children}
      </div>
    </li>
  );
};

export const FeedComments = ({ postId, postAuthorId, onCountChange }) => {
  const user = useAppStore((s) => s.user);
  const toastError = useAppStore((s) => s.toastError);
  const myId = String(user?.id || user?._id || "");
  // A post's author moderates its whole thread, and the platform admin
  // moderates everything. Mirrors the server's rule so the button only shows
  // where the request would actually succeed.
  const moderates = myId === String(postAuthorId || "") || user?.role === "MAIN_ADMIN";

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

  const listRef = useRef(null);

  // No setLoading(true) here: `loading` starts true, and both callers mount
  // this per post — the sheet unmounts on close, and FeedPostPage is keyed by
  // the route param — so a different post gets fresh state rather than
  // re-running against stale state. Same reasoning as VideoComments.
  useEffect(() => {
    let cancelled = false;

    listPostComments(postId, { limit: PAGE })
      .then((res) => {
        if (cancelled) return;
        setComments(res.items || []);
        setHasMore(Boolean(res.hasMore));
        setPage(1);
      })
      .catch(() => {
        // The post is still readable without its comments.
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const res = await listPostComments(postId, { page: next, limit: PAGE });
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

  /** Optimistic like on a comment or a reply, reverted on failure. */
  const likeComment = async (comment) => {
    const optimistic = (c) => ({
      ...c,
      likedByMe: !c.likedByMe,
      likeCount: Math.max(0, c.likeCount + (c.likedByMe ? -1 : 1)),
    });

    const apply = (updater) => {
      if (comment.parentId) {
        setReplies((map) => ({
          ...map,
          [comment.parentId]: (map[comment.parentId] || []).map((c) =>
            c.id === comment.id ? updater(c) : c
          ),
        }));
      } else {
        setComments((list) => list.map((c) => (c.id === comment.id ? updater(c) : c)));
      }
    };

    apply(optimistic);

    try {
      const res = await toggleFeedCommentLike(comment.id);
      apply((c) => ({ ...c, likeCount: res.likeCount, likedByMe: res.likedByMe }));
    } catch (err) {
      apply(() => comment);
      toastError(err.message || "Could not save that");
    }
  };

  /** Opens or closes a reply thread, fetching it the first time only. */
  const toggleReplies = async (comment, showOnly = false) => {
    const id = comment.id;
    const isOpen = openReplies[id];

    if (!showOnly) {
      setReplyTo(isOpen && replyTo === id ? null : id);
      setReplyDraft("");
    }

    if (isOpen && showOnly) {
      setOpenReplies((m) => ({ ...m, [id]: false }));
      return;
    }

    setOpenReplies((m) => ({ ...m, [id]: true }));

    // Cached after the first open — reopening should not re-fetch.
    if (replies[id] || comment.replyCount === 0) return;

    setLoadingReplies((m) => ({ ...m, [id]: true }));
    try {
      const res = await listCommentReplies(id);
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
      const res = await addPostComment(postId, body);
      setComments((list) => [res.comment, ...list]);
      setDraft("");
      onCountChange?.(1);
      listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
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
      const res = await addPostComment(postId, body, parentId);
      setReplies((m) => ({ ...m, [parentId]: [...(m[parentId] || []), res.comment] }));
      setComments((list) =>
        list.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c))
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
    const goneCount = parentId ? 1 : 1 + (replies[comment.id]?.length ?? comment.replyCount ?? 0);

    if (parentId) {
      setReplies((m) => ({
        ...m,
        [parentId]: (m[parentId] || []).filter((c) => c.id !== comment.id),
      }));
      setComments((list) =>
        list.map((c) =>
          c.id === parentId ? { ...c, replyCount: Math.max(0, c.replyCount - 1) } : c
        )
      );
    } else {
      setComments((list) => list.filter((c) => c.id !== comment.id));
    }

    try {
      await deleteFeedComment(comment.id);
      onCountChange?.(-goneCount);
    } catch (err) {
      setComments(previousComments);
      setReplies(previousReplies);
      toastError(err.message || "Could not remove that comment");
    }
  };

  // Carries the moderator flag to Row without threading a second prop through.
  const onDelete = Object.assign((c) => removeComment(c), { always: moderates });

  return (
    <section className={styles.wrap}>
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={submitComment}
        busy={posting}
        placeholder="Add a comment…"
        avatar={<Avatar name={user?.name} url={user?.avatarUrl} size={32} />}
      />

      <div className={styles.list} ref={listRef}>
        {loading ? (
          <p className={styles.muted}>Loading comments…</p>
        ) : !comments.length ? (
          <p className={styles.muted}>No comments yet. Start the conversation.</p>
        ) : (
          <ul className={styles.ul}>
            {comments.map((c) => (
              <Row
                key={c.id}
                comment={c}
                myId={myId}
                onLike={likeComment}
                onReply={toggleReplies}
                onDelete={onDelete}
              >
                {c.replyCount > 0 && (
                  <button
                    type="button"
                    className={styles.repliesToggle}
                    onClick={() => toggleReplies(c, true)}
                  >
                    <span className={styles.rule} />
                    {openReplies[c.id] ? "Hide" : "View"} {c.replyCount}{" "}
                    {c.replyCount === 1 ? "reply" : "replies"}
                  </button>
                )}

                {loadingReplies[c.id] && <p className={styles.muted}>Loading replies…</p>}

                {openReplies[c.id] && (replies[c.id] || []).length > 0 && (
                  <ul className={styles.ul}>
                    {(replies[c.id] || []).map((r) => (
                      <Row
                        key={r.id}
                        comment={r}
                        myId={myId}
                        onLike={likeComment}
                        onReply={toggleReplies}
                        onDelete={onDelete}
                        isReply
                      />
                    ))}
                  </ul>
                )}

                {replyTo === c.id && (
                  <Composer
                    value={replyDraft}
                    onChange={setReplyDraft}
                    onSubmit={() => submitReply(c.id)}
                    busy={replyPosting}
                    placeholder={`Reply to ${c.author?.name || "this comment"}…`}
                    avatar={null}
                    autoFocus
                  />
                )}
              </Row>
            ))}
          </ul>
        )}

        {hasMore && (
          <button type="button" className={styles.loadMore} onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more comments"}
          </button>
        )}
      </div>
    </section>
  );
};

export default FeedComments;
