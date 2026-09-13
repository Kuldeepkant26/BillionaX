import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { listUserPosts } from "../../api/feed.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { avatarUrl } from "../../utils/upload.js";
import { initials } from "../../utils/format.js";
import { FeedGrid } from "../../features/guest/FeedGrid.jsx";
import { VerifiedTick } from "../../features/guest/VerifiedTick.jsx";
import { FeedGridSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { Button, Empty, ErrorState } from "../../components/common/index.jsx";

/** One person's posts: a header and a square grid, tapping through to a post. */
const FeedProfilePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const [page, setPage] = useState(1);

  const { data, error, loading, run } = useAsync(
    () => listUserPosts(userId, { page }),
    [userId, page],
    { cacheKey: "feed.userPosts" }
  );

  const [broken, setBroken] = useState(false);

  if (loading && !data) return <FeedGridSkeleton />;
  if (error && !data) return <ErrorState error={error} onRetry={run} />;
  if (!data) return null;

  const { author, items = [], hasMore } = data;
  const isMe = author?.id === me?.id;

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

      <header className="flex items-center gap-3.5 mb-4.5">
        <span className="relative shrink-0 grid place-items-center w-16 h-16 rounded-full bg-chip text-muted font-bold overflow-hidden">
          {author?.avatarUrl && !broken ? (
            <img
              src={avatarUrl(author.avatarUrl, 128)}
              alt=""
              className="w-full h-full object-cover block"
              onError={() => setBroken(true)}
            />
          ) : (
            <span className="text-xl">{initials(author?.name)}</span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-semibold text-ink m-0 flex items-center gap-1.5 truncate">
            {author?.name}
            {author?.isVerified && <VerifiedTick size={15} />}
          </h1>
          <p className="text-xs text-muted mt-1 mb-0 tabular-nums">
            {items.length}
            {hasMore ? "+" : ""} post{items.length === 1 && !hasMore ? "" : "s"}
          </p>
        </div>
      </header>

      {!items.length ? (
        <Empty
          title={isMe ? "You have not posted yet" : "No posts yet"}
          hint={isMe ? "Share a photo from the feed." : undefined}
        />
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

export default FeedProfilePage;
