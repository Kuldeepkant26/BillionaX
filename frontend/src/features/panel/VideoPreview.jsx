import { useEffect, useState } from "react";
import { videoComments, deleteVideoComment } from "../../api/hotel.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Modal, Empty, Loading } from "../../components/common/index.jsx";
import { VideoPlayer } from "../guest/VideoPlayer.jsx";
import { initials, timeAgo } from "../../utils/format.js";
import styles from "./VideoPreview.module.css";

/**
 * What a guest sees, from the panel: the video playing in the real player, and
 * the conversation underneath it.
 *
 * The SAME VideoPlayer the guest app uses, deliberately — a preview built from
 * a bare <video> would not show the poster, the duration or the buffering
 * behaviour the guest actually gets, which is most of what a manager is
 * checking when they hit Preview.
 */

const Avatar = ({ name, url, size = 28 }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.avatar} style={{ width: size, height: size }}>
      {url && !broken ? (
        <img src={url} alt="" onError={() => setBroken(true)} />
      ) : (
        <i style={{ fontSize: size * 0.36 }}>{initials(name)}</i>
      )}
    </span>
  );
};

const Comment = ({ comment, onDelete, isReply = false, busyId }) => (
  <li className={isReply ? styles.reply : styles.comment}>
    <Avatar name={comment.author?.name} url={comment.author?.avatarUrl} size={isReply ? 24 : 28} />
    <div className={styles.body}>
      <div className={styles.head}>
        <b>{comment.author?.name}</b>
        {comment.author?.isHost && <span className={styles.host}>Host</span>}
        <i>{timeAgo(comment.createdAt)}</i>
        {comment.likeCount > 0 && (
          <span className={styles.likes} title={`${comment.likeCount} likes`}>
            <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
              <path
                d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"
                fill="currentColor"
              />
            </svg>
            {comment.likeCount}
          </span>
        )}
      </div>
      <p>{comment.body}</p>
      <button
        type="button"
        className={styles.remove}
        onClick={() => onDelete(comment)}
        disabled={busyId === comment.id}
      >
        {busyId === comment.id ? "Removing…" : "Remove"}
      </button>
    </div>
  </li>
);

const PreviewBody = ({ video }) => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  const [thread, setThread] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // No setLoading(true) here: `loading` starts true and this body is keyed on
  // the video id by the wrapper below, so opening a different video remounts
  // it with fresh state instead of re-running against the previous thread.
  useEffect(() => {
    let cancelled = false;

    videoComments(video._id)
      .then((res) => {
        if (cancelled) return;
        setThread(res.items || []);
        setTotal(res.total || 0);
      })
      .catch(() => {
        // The video still previews without its comments.
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [video._id]);

  /**
   * Removing a root takes its replies with it, matching the server — so the
   * count drops by the whole thread, not by one.
   */
  const remove = async (comment) => {
    setBusyId(comment.id);
    try {
      const res = await deleteVideoComment(comment.id);
      setThread((list) =>
        list
          .filter((c) => c.id !== comment.id)
          .map((c) => ({ ...c, replies: c.replies.filter((r) => r.id !== comment.id) }))
      );
      setTotal((n) => Math.max(0, n - (res?.removed || 1)));
      toastSuccess("Comment removed");
    } catch (err) {
      toastError(err.message || "Could not remove that comment");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className={styles.player}>
        <VideoPlayer
          src={video.videoUrl}
          poster={video.imageUrl}
          title={video.title}
          fallbackDuration={video.duration}
        />
      </div>

      {video.description && <p className={styles.desc}>{video.description}</p>}

      <h4 className={styles.heading}>
        {total > 0 ? `${total} ${total === 1 ? "comment" : "comments"}` : "Comments"}
      </h4>

      {loading ? (
        <Loading />
      ) : thread.length === 0 ? (
        <Empty title="No comments yet" hint="Guest comments on this video will appear here." />
      ) : (
        <ul className={styles.list}>
          {thread.map((comment) => (
            <li key={comment.id}>
              <ul className={styles.bare}>
                <Comment comment={comment} onDelete={remove} busyId={busyId} />
                {comment.replies?.length > 0 && (
                  <li>
                    <ul className={styles.replies}>
                      {comment.replies.map((reply) => (
                        <Comment
                          key={reply.id}
                          comment={reply}
                          onDelete={remove}
                          busyId={busyId}
                          isReply
                        />
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};

/**
 * Keyed on the video id so opening a different video remounts the body: the
 * thread, the loading flag and the player all reset together, which is what
 * "a different video" means.
 */
export const VideoPreview = ({ open, video, onClose }) => {
  if (!open || !video) return null;

  return (
    <Modal open={open} title={video.title} onClose={onClose}>
      <PreviewBody key={video._id} video={video} />
    </Modal>
  );
};
