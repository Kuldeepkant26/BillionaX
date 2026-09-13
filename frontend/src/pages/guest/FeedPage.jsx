import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listFeed } from "../../api/feed.api.js";
import { useFeedList } from "../../hooks/useFeedList.js";
import { useFeedActions } from "../../hooks/useFeedActions.js";
import { useFeedRealtime } from "../../hooks/useFeedRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { FeedPostCard } from "../../features/guest/FeedPostCard.jsx";
import { FeedSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { FeedCommentSheet } from "../../features/guest/FeedCommentSheet.jsx";
import { LikesSheet } from "../../features/guest/LikesSheet.jsx";
import { FeedComposer } from "../../features/guest/FeedComposer.jsx";
import { Button, Empty, ErrorState, Spinner } from "../../components/common/index.jsx";
import { ROUTES } from "../../constants/routePaths.js";

/**
 * The global feed.
 *
 * Infinite scroll via an IntersectionObserver on a sentinel, with a visible
 * "Load more" button as well. The button is not a fallback nobody sees: on a
 * short list, a tall screen, or with the observer unsupported, the sentinel may
 * never intersect, and a feed that silently stops is indistinguishable from one
 * that has ended.
 */
const FeedPage = () => {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);

  const [commentsFor, setCommentsFor] = useState(null);
  const [likesFor, setLikesFor] = useState(null);
  const [composing, setComposing] = useState(false);

  const fetcher = useCallback((params) => listFeed(params), []);
  const { items, hasMore, loading, loadingMore, error, loadMore, refresh, patchPost, removePost } =
    useFeedList(fetcher, { cacheKey: "feed.global" });

  const { like, save, remove } = useFeedActions({ patch: patchPost, remove: removePost });

  const newPostCount = useAppStore((s) => s.newPostCount);
  const bumpNewPosts = useAppStore((s) => s.bumpNewPosts);
  const clearNewPosts = useAppStore((s) => s.clearNewPosts);

  useFeedRealtime({
    onNewPost: bumpNewPosts,
    // On reconnect and on tab focus, silently re-read the top of the feed. A
    // push missed while the tab was backgrounded therefore heals itself, which
    // is why none of this needs a delivery queue.
    onResync: () => refresh({ quiet: true }),
  });

  /** The pill's tap: jump to the top and pull the newest page. */
  const showNewPosts = useCallback(() => {
    clearNewPosts();
    globalThis.scrollTo({ top: 0, behavior: "smooth" });
    refresh();
  }, [clearNewPosts, refresh]);

  const sentinel = useRef(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      // Starts fetching a screen early, so the next page is usually there
      // before the reader reaches the bottom.
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  /** A post's own author may remove it; so may the platform admin. */
  const canDelete = useCallback(
    (post) => post.author?.id === user?.id || user?.role === "MAIN_ADMIN",
    [user]
  );

  if (loading && !items.length) return <FeedSkeleton />;
  if (error && !items.length) {
    return <ErrorState message="Could not load the feed" onRetry={() => refresh()} />;
  }

  return (
    <>
      {/* Compose lives in the header rather than floating over the feed: a
          fixed button sits on top of whatever card is under it, which on a
          phone is usually someone's caption. */}
      <header className="flex items-center justify-between mb-3.5">
        <h1 className="font-display text-[22px] font-semibold text-ink m-0">Feed</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate(ROUTES.APP_FEED_SAVED)}
            aria-label="Saved posts"
            className="grid place-items-center w-9 h-9 rounded-full text-muted hover:text-ink hover:bg-chip bg-transparent border-0 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 21l-6-4.4L6 21V4.6A1.6 1.6 0 0 1 7.6 3h8.8A1.6 1.6 0 0 1 18 4.6z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setComposing(true)}
            aria-label="Create a post"
            className="grid place-items-center w-9 h-9 rounded-full text-ink hover:bg-chip bg-transparent border-0 cursor-pointer"
          >
            <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.4" />
              <path d="M12 8.4v7.2M8.4 12h7.2" />
            </svg>
          </button>
        </div>
      </header>

      {newPostCount > 0 && (
        <div className="sticky top-2 z-30 flex justify-center pointer-events-none mb-2">
          <button
            type="button"
            onClick={showNewPosts}
            className="pointer-events-auto flex items-center gap-1.5 px-3.5 h-9 rounded-full bg-accent text-accent-fg border-0 text-xs font-semibold shadow-md cursor-pointer"
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 16V4M5 9l5-5 5 5" />
            </svg>
            {newPostCount} new post{newPostCount === 1 ? "" : "s"}
          </button>
        </div>
      )}

      {!items.length ? (
        <Empty title="Nothing here yet" hint="Be the first to share a photo." />
      ) : (
        <>
          {items.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onToggleLike={like}
              onToggleSave={save}
              onOpenComments={setCommentsFor}
              onOpenLikes={setLikesFor}
              onDelete={remove}
              canDelete={canDelete(post)}
            />
          ))}

          <div ref={sentinel} aria-hidden="true" />

          {hasMore && (
            <div className="flex justify-center py-3">
              {loadingMore ? (
                <Spinner />
              ) : (
                <Button variant="ghost" onClick={loadMore}>
                  Load more
                </Button>
              )}
            </div>
          )}

          {!hasMore && items.length > 3 && (
            <p className="text-center text-[11px] text-muted py-3 m-0">You are all caught up</p>
          )}
        </>
      )}

      {commentsFor && (
        <FeedCommentSheet
          post={commentsFor}
          onClose={() => setCommentsFor(null)}
          onCountChange={(delta) =>
            patchPost(commentsFor.id, (p) => ({
              commentCount: Math.max(0, (p.commentCount || 0) + delta),
            }))
          }
        />
      )}

      {likesFor && <LikesSheet post={likesFor} onClose={() => setLikesFor(null)} />}

      {composing && (
        <FeedComposer
          onClose={() => setComposing(false)}
          onPosted={() => {
            setComposing(false);
            // The refresh below brings their own post to the top, so any pill
            // raised while the composer was open has already been answered.
            clearNewPosts();
            refresh();
          }}
        />
      )}
    </>
  );
};

export default FeedPage;
