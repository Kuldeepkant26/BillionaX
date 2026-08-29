import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addVideoComment,
  deleteVideoComment,
  getVideo,
  listVideoComments,
  toggleVideoLike,
} from "../../api/guest.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ErrorState, Empty } from "../../components/common/index.jsx";
import { VideoPlayer } from "../../features/guest/VideoPlayer.jsx";
import { VideoSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { videoPath } from "../../constants/routePaths.js";
import { initials, timeAgo } from "../../utils/format.js";
import { videoPoster } from "../../utils/upload.js";
import styles from "./VideoPage.module.css";

/**
 * Watch screen: player on top, then the video's own details and actions, the
 * comment thread, and the hotel's other videos underneath.
 *
 * The layout follows the pattern people already know from a phone video app,
 * because this screen has no novel affordances to teach — what is different is
 * only the palette and the typography.
 */

const COMMENT_PAGE = 20;

const Avatar = ({ name, url }) =>
  url ? (
    <img src={url} alt="" className="h-8 w-8 flex-none rounded-full object-cover" />
  ) : (
    <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-chip text-[11px] font-bold text-muted">
      {initials(name)}
    </span>
  );

const WatchScreen = ({ contentId }) => {
  const navigate = useNavigate();

  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const user = useAppStore((s) => s.user);
  const toastError = useAppStore((s) => s.toastError);

  const { data, loading, error, run, setData } = useAsync(
    () => getVideo(activeHotelId, contentId),
    [activeHotelId, contentId]
  );

  // Comments are their own request: the video should paint the moment its
  // metadata lands rather than waiting on a thread nobody has scrolled to.
  //
  // No reset effect here — the whole page is keyed on contentId (see the
  // default export), so navigating to another video remounts this component
  // with fresh state instead of clearing eight pieces of it by hand.
  const [comments, setComments] = useState([]);
  const [commentsPage, setCommentsPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [loadingComments, setLoadingComments] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // A remount does not move the window, so a guest who tapped an up-next row
  // from halfway down the comments would land on the new video already
  // scrolled past its player.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    let cancelled = false;

    listVideoComments(activeHotelId, contentId, { limit: COMMENT_PAGE })
      .then((res) => {
        if (cancelled) return;
        setComments(res.items || []);
        setHasMoreComments(Boolean(res.hasMore));
      })
      .catch(() => {
        // The video is still watchable without its comments.
      })
      .finally(() => !cancelled && setLoadingComments(false));

    return () => {
      cancelled = true;
    };
  }, [activeHotelId, contentId]);

  const loadMoreComments = async () => {
    try {
      const next = commentsPage + 1;
      const res = await listVideoComments(activeHotelId, contentId, {
        page: next,
        limit: COMMENT_PAGE,
      });
      setComments((list) => [...list, ...(res.items || [])]);
      setCommentsPage(next);
      setHasMoreComments(Boolean(res.hasMore));
    } catch {
      // Swallowed so the button stays retryable.
    }
  };

  const like = async () => {
    if (!data?.video) return;
    const video = data.video;

    // Optimistic: a like that waits for the server feels broken on a slow
    // connection. Reverted below if the request fails.
    const optimistic = {
      likedByMe: !video.likedByMe,
      likeCount: video.likeCount + (video.likedByMe ? -1 : 1),
    };
    setData({ ...data, video: { ...video, ...optimistic } });

    try {
      const res = await toggleVideoLike(activeHotelId, contentId);
      setData((current) => ({
        ...current,
        video: { ...current.video, likeCount: res.likeCount, likedByMe: res.likedByMe },
      }));
    } catch (err) {
      setData({ ...data, video });
      toastError(err.message || "Could not save that");
    }
  };

  const submitComment = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || posting) return;

    setPosting(true);
    try {
      const res = await addVideoComment(activeHotelId, contentId, body);
      setComments((list) => [res.comment, ...list]);
      setDraft("");
      setData((current) => ({
        ...current,
        video: { ...current.video, commentCount: (current.video.commentCount || 0) + 1 },
      }));
    } catch (err) {
      toastError(err.message || "Could not post that comment");
    } finally {
      setPosting(false);
    }
  };

  const removeComment = async (id) => {
    const previous = comments;
    setComments((list) => list.filter((c) => c.id !== id));
    try {
      await deleteVideoComment(id);
      setData((current) => ({
        ...current,
        video: { ...current.video, commentCount: Math.max(0, (current.video.commentCount || 1) - 1) },
      }));
    } catch (err) {
      setComments(previous);
      toastError(err.message || "Could not remove that comment");
    }
  };

  if (loading && !data) return <VideoSkeleton />;
  if (error) return <ErrorState error={error} onRetry={run} />;
  if (!data?.video) return <Empty title="Video not found" hint="It may have been removed." />;

  const { video, related } = data;
  const longDescription = (video.description || "").length > 120;

  return (
    // Bleeds past the page gutter: the player is the header of this screen and
    // a margin either side of it would look like a mistake.
    <div className={styles.page}>
      <div className={styles.playerWrap}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={styles.back}
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="#fff">
            <path d="M15.4 4.6 7 13l8.4 8.4 1.6-1.6L10.2 13 17 6.2z" />
          </svg>
        </button>

        <VideoPlayer src={video.videoUrl} poster={video.imageUrl} title={video.title} />
      </div>

      <div className={styles.body}>
        <h1 className="font-display text-[18px] font-semibold leading-[1.25]">{video.title}</h1>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
          {video.outlet && <span>{video.outlet}</span>}
          {video.outlet && <span aria-hidden="true">·</span>}
          <span>{video.likeCount === 1 ? "1 like" : `${video.likeCount} likes`}</span>
          <span aria-hidden="true">·</span>
          <span>{timeAgo(video.createdAt)}</span>
        </div>

        {/* Actions row */}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={like}
            aria-pressed={video.likedByMe}
            className={`${styles.action} ${video.likedByMe ? styles.actionOn : ""}`}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"
                fill={video.likedByMe ? "currentColor" : "none"}
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            {video.likeCount > 0 ? video.likeCount : "Like"}
          </button>

          <a href="#comments" className={styles.action}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M20 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3v4l5-4h8a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            {video.commentCount > 0 ? video.commentCount : "Comment"}
          </a>
        </div>

        {video.description && (
          <div className={`${styles.desc} mt-3`}>
            <p className={expanded || !longDescription ? "" : styles.clamp}>{video.description}</p>
            {longDescription && (
              <button
                type="button"
                className="mt-1 text-[11.5px] font-semibold text-accent"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        {/* ---- comments ---- */}
        <section id="comments" className="mt-6">
          <h2 className="kicker mb-2.5">
            {video.commentCount > 0 ? `${video.commentCount} comments` : "Comments"}
          </h2>

          <form onSubmit={submitComment} className="mb-4 flex items-start gap-2.5">
            <Avatar name={user?.name} url={user?.avatarUrl} />
            <div className="min-w-0 flex-1">
              <textarea
                className={styles.composer}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={1}
                maxLength={600}
                onInput={(e) => {
                  // Grows with the text instead of scrolling inside a fixed
                  // box, which on a phone hides what you just typed.
                  e.currentTarget.style.height = "auto";
                  e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
                }}
              />
              {draft.trim() && (
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setDraft("")}
                    disabled={posting}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-sm" disabled={posting}>
                    {posting ? "Posting…" : "Comment"}
                  </button>
                </div>
              )}
            </div>
          </form>

          {loadingComments ? (
            <p className="py-4 text-center text-[12px] text-muted">Loading comments…</p>
          ) : comments.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-muted">
              No comments yet — say something first.
            </p>
          ) : (
            <ul className="flex flex-col gap-3.5">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2.5">
                  <Avatar name={comment.author?.name} url={comment.author?.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <b className="text-[12px] font-semibold">{comment.author?.name}</b>
                      <i className="not-italic text-[10.5px] text-muted">
                        {timeAgo(comment.createdAt)}
                      </i>
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-[1.5]">
                      {comment.body}
                    </p>
                    {comment.author?.id === String(user?.id || user?._id) && (
                      <button
                        type="button"
                        className="mt-1 text-[11px] font-semibold text-muted hover:text-[var(--bad)]"
                        onClick={() => removeComment(comment.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hasMoreComments && (
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-block mt-4"
              onClick={loadMoreComments}
            >
              Load more comments
            </button>
          )}
        </section>

        {/* ---- up next ---- */}
        {related?.length > 0 && (
          <section className="mt-7">
            <h2 className="kicker mb-2.5">More from this hotel</h2>
            <ul className="flex flex-col gap-3">
              {related.map((item) => (
                <li key={item._id}>
                  <button
                    type="button"
                    className={styles.upNext}
                    onClick={() => navigate(videoPath(item._id))}
                  >
                    <span className={styles.thumb}>
                      {videoPoster(item.videoUrl, 320) || item.imageUrl ? (
                        <img
                          src={videoPoster(item.videoUrl, 320) || item.imageUrl}
                          alt=""
                          className="block h-full w-full object-cover"
                        />
                      ) : null}
                      {item.duration && <em className={styles.dur}>{item.duration}</em>}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <b className="line-clamp-2 block text-[12.5px] font-semibold leading-[1.3]">
                        {item.title}
                      </b>
                      <i className="mt-1 block not-italic text-[10.5px] text-muted">
                        {item.likeCount > 0 && `${item.likeCount} likes · `}
                        {timeAgo(item.createdAt)}
                      </i>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
};

/**
 * Keyed on the video id so tapping one in the up-next rail remounts the
 * screen: the player, the comment thread, the composer draft and the scroll
 * position all reset together, which is what "a different video" means. The
 * alternative is clearing eight pieces of state by hand in an effect and
 * getting one of them wrong.
 */
const VideoPage = () => {
  const { contentId } = useParams();
  return <WatchScreen key={contentId} contentId={contentId} />;
};

export default VideoPage;
