import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { listSavedPosts } from "../../api/feed.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { FeedGrid } from "../../features/guest/FeedGrid.jsx";
import { FeedGridSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { Button, Empty, ErrorState } from "../../components/common/index.jsx";
import { ROUTES } from "../../constants/routePaths.js";

/**
 * Posts the reader bookmarked, most-recently-saved first.
 *
 * Saves are private — nothing anywhere shows who saved a post or how many
 * people did.
 */
const SavedPostsPage = () => {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);

  const { data, error, loading, run } = useAsync(() => listSavedPosts({ page }), [page], {
    cacheKey: "feed.saved",
  });

  if (loading && !data) return <FeedGridSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={run} />;

  const items = data?.items || [];
  const hasMore = data?.hasMore;

  return (
    <>
      <button
        type="button"
        onClick={() => navigate(ROUTES.APP_FEED)}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink bg-transparent border-0 p-0 mb-3 cursor-pointer"
      >
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l-6 6 6 6" />
        </svg>
        Feed
      </button>

      <h1 className="font-display text-[22px] font-semibold text-ink m-0 mb-1">Saved</h1>
      <p className="text-xs text-muted mt-0 mb-4">Only you can see what you have saved.</p>

      {!items.length ? (
        <Empty title="Nothing saved yet" hint="Tap the bookmark on a post to keep it here." />
      ) : (
        <>
          <FeedGrid posts={items} />
          {(hasMore || page > 1) && (
            <div className="flex justify-center gap-2 py-4">
              {page > 1 && (
                <Button variant="ghost" onClick={() => setPage((p) => p - 1)}>
                  Newer
                </Button>
              )}
              {hasMore && (
                <Button variant="ghost" onClick={() => setPage((p) => p + 1)}>
                  Older
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
};

export default SavedPostsPage;
