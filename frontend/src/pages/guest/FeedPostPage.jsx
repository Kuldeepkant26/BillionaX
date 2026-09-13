import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPost } from "../../api/feed.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useFeedActions } from "../../hooks/useFeedActions.js";
import { useAppStore } from "../../store/useAppStore.js";
import { FeedPostCard } from "../../features/guest/FeedPostCard.jsx";
import { FeedComments } from "../../features/guest/FeedComments.jsx";
import { LikesSheet } from "../../features/guest/LikesSheet.jsx";
import { FeedSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { ErrorState } from "../../components/common/index.jsx";
import { ROUTES } from "../../constants/routePaths.js";

/**
 * One post, with its comments inline rather than in a sheet.
 *
 * This is the deep-link target — a shared URL, a tap from a profile grid — so
 * the thread is part of the page the reader arrived at, not something they have
 * to open.
 */
const FeedPostPage = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const [likesOpen, setLikesOpen] = useState(false);

  const { data, error, loading, run, setData } = useAsync(() => getPost(postId), [postId], {
    cacheKey: "feed.post",
  });

  const post = data?.post;

  // setData writes through to the cache, so a like here survives navigating
  // away and back rather than repainting from a stale copy.
  const patch = useCallback(
    (_id, changes) =>
      setData((prev) =>
        prev?.post
          ? {
              ...prev,
              post: {
                ...prev.post,
                ...(typeof changes === "function" ? changes(prev.post) : changes),
              },
            }
          : prev
      ),
    [setData]
  );

  const { like, save, remove } = useFeedActions({
    patch,
    // The post no longer exists, so there is nothing to return to.
    remove: () => navigate(ROUTES.APP_FEED, { replace: true }),
  });

  if (loading && !post) return <FeedSkeleton />;
  if (error && !post) return <ErrorState error={error} onRetry={run} />;
  if (!post) return null;

  const canDelete = post.author?.id === user?.id || user?.role === "MAIN_ADMIN";

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink bg-transparent border-0 p-0 mb-3 cursor-pointer"
      >
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l-6 6 6 6" />
        </svg>
        Back
      </button>

      <FeedPostCard
        post={post}
        onToggleLike={like}
        onToggleSave={save}
        onOpenLikes={() => setLikesOpen(true)}
        onDelete={remove}
        canDelete={canDelete}
        // The thread is right below; a "view comments" button would scroll to
        // something already on screen.
        onOpenComments={() => document.getElementById("comments")?.scrollIntoView({ behavior: "smooth" })}
      />

      <div id="comments" className="mt-1">
        <FeedComments
          postId={post.id}
          postAuthorId={post.author?.id}
          onCountChange={(delta) =>
            patch(post.id, (p) => ({ commentCount: Math.max(0, (p.commentCount || 0) + delta) }))
          }
        />
      </div>

      {likesOpen && <LikesSheet post={post} onClose={() => setLikesOpen(false)} />}
    </>
  );
};

export default FeedPostPage;
