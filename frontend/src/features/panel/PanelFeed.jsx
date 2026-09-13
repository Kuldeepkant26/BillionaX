import { useCallback, useState } from "react";
import {
  listCommentInbox,
  listFeed,
  listHotelPosts,
  listMyPosts,
  listModerationPosts,
} from "../../api/feed.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useFeedList } from "../../hooks/useFeedList.js";
import { useFeedActions } from "../../hooks/useFeedActions.js";
import { invalidateCache } from "../../hooks/asyncCache.js";
import { useAppStore } from "../../store/useAppStore.js";
import { avatarUrl, feedImage } from "../../utils/upload.js";
import { initials, timeAgo } from "../../utils/format.js";
import { FeedPostCard } from "../guest/FeedPostCard.jsx";
import { FeedComposer } from "../guest/FeedComposer.jsx";
import { FeedCommentSheet } from "../guest/FeedCommentSheet.jsx";
import { LikesSheet } from "../guest/LikesSheet.jsx";
import { VerifiedTick } from "../guest/VerifiedTick.jsx";
import { Button, Empty, ErrorState, Spinner } from "../../components/common/index.jsx";
import styles from "./PanelFeed.module.css";

/**
 * The Feed tab shared by the hotel and admin panels.
 *
 * Both panels want the same four things — manage my posts, answer comments,
 * browse the network, and (for the platform admin) moderate it — so they share
 * one component and differ only in which tabs they are given. Two copies would
 * have drifted the first time one of them was fixed.
 *
 * The post card, composer and comment sheet are the GUEST components. A post is
 * the same object wherever it is read, and a second panel-flavoured card would
 * be the same markup with a different stylesheet.
 */

const Who = ({ name, avatar, verified, size = 28, sub }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className={styles.who}>
      <span className={styles.avatar} style={{ width: size, height: size }}>
        {avatar && !broken ? (
          <img src={avatarUrl(avatar, size * 2)} alt="" onError={() => setBroken(true)} />
        ) : (
          <span style={{ fontSize: size * 0.36 }}>{initials(name)}</span>
        )}
      </span>
      <span className={styles.whoText}>
        <b>
          {name}
          {verified && <VerifiedTick size={11} />}
        </b>
        {sub && <i>{sub}</i>}
      </span>
    </span>
  );
};

/** A scrolling list of posts with the panel's own chrome around it. */
const PostList = ({ fetcher, cacheKey, emptyTitle, emptyHint, onCompose }) => {
  const user = useAppStore((s) => s.user);
  const [commentsFor, setCommentsFor] = useState(null);
  const [likesFor, setLikesFor] = useState(null);

  const { items, hasMore, loading, loadingMore, error, loadMore, refresh, patchPost, removePost } =
    useFeedList(fetcher, { cacheKey });
  const { like, save, remove } = useFeedActions({ patch: patchPost, remove: removePost });

  if (loading && !items.length) return <Spinner />;
  if (error && !items.length) return <ErrorState error={error} onRetry={() => refresh()} />;

  return (
    <>
      {onCompose && (
        <div className={styles.bar}>
          <Button onClick={onCompose}>Create a post</Button>
        </div>
      )}

      {!items.length ? (
        <Empty title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className={styles.column}>
          {items.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onToggleLike={like}
              onToggleSave={save}
              onOpenComments={setCommentsFor}
              // The like count itself opens the list, same as in the guest app.
              onOpenLikes={setLikesFor}
              onDelete={remove}
              canDelete={post.author?.id === user?.id || user?.role === "MAIN_ADMIN"}
            />
          ))}

          {hasMore && (
            <div className={styles.bar}>
              {loadingMore ? <Spinner /> : <Button variant="ghost" onClick={loadMore}>Load more</Button>}
            </div>
          )}
        </div>
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
    </>
  );
};

/**
 * Comments on the caller's own posts — the reply inbox.
 *
 * Pulled rather than pushed: this is a screen someone opens when they mean to
 * answer people, which is a different thing from being interrupted by a toast.
 */
const CommentInbox = () => {
  const [page, setPage] = useState(1);
  const [replyTo, setReplyTo] = useState(null);

  const { data, error, loading, run } = useAsync(() => listCommentInbox({ page }), [page], {
    cacheKey: "feed.commentInbox",
  });

  if (loading && !data) return <Spinner />;
  if (error && !data) return <ErrorState error={error} onRetry={run} />;

  const items = data?.items || [];

  return (
    <>
      {!items.length ? (
        <Empty title="No comments yet" hint="Comments on your posts land here." />
      ) : (
        <ul className={styles.inbox}>
          {items.map((c) => (
            <li key={c.id}>
              <Who
                name={c.author?.name}
                avatar={c.author?.avatarUrl}
                verified={c.author?.isVerified}
                sub={timeAgo(c.createdAt)}
              />
              <p className={styles.inboxBody}>{c.body}</p>

              <div className={styles.inboxFoot}>
                {c.post?.image && (
                  <img className={styles.thumb} src={feedImage(c.post.image, 80)} alt="" />
                )}
                <span className={styles.inboxCaption}>
                  {c.post?.caption?.slice(0, 60) || "your post"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setReplyTo({
                      id: c.post?.id,
                      // The sheet needs enough of a post to render its thread.
                      author: { id: null },
                      commentCount: 0,
                    })
                  }
                  disabled={!c.post?.id}
                >
                  Open thread
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(data?.total || 0) > (data?.limit || 25) && (
        <div className={styles.bar}>
          {page > 1 && (
            <Button variant="ghost" onClick={() => setPage((p) => p - 1)}>
              Newer
            </Button>
          )}
          {page * (data?.limit || 25) < (data?.total || 0) && (
            <Button variant="ghost" onClick={() => setPage((p) => p + 1)}>
              Older
            </Button>
          )}
        </div>
      )}

      {replyTo && (
        <FeedCommentSheet
          post={replyTo}
          onClose={() => {
            setReplyTo(null);
            // A reply or a delete changes what the inbox holds.
            invalidateCache("feed.commentInbox");
            run();
          }}
        />
      )}
    </>
  );
};

/** MAIN_ADMIN's moderation view: every post on the network, filterable. */
const Moderation = () => {
  const [filters, setFilters] = useState({ role: "", q: "" });
  const [page, setPage] = useState(1);
  const user = useAppStore((s) => s.user);
  const [commentsFor, setCommentsFor] = useState(null);
  const [likesFor, setLikesFor] = useState(null);

  const { data, error, loading, run, setData } = useAsync(
    () => listModerationPosts({ page, role: filters.role || undefined, q: filters.q || undefined }),
    [page, filters.role, filters.q],
    { cacheKey: "feed.moderation" }
  );

  const patch = useCallback(
    (postId, changes) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((p) =>
                p.id === postId ? { ...p, ...(typeof changes === "function" ? changes(p) : changes) } : p
              ),
            }
          : prev
      ),
    [setData]
  );

  const { like, save, remove } = useFeedActions({
    patch,
    remove: (postId) =>
      setData((prev) => (prev ? { ...prev, items: prev.items.filter((p) => p.id !== postId) } : prev)),
  });

  const items = data?.items || [];

  return (
    <>
      <div className={styles.filters}>
        <select
          className="input"
          value={filters.role}
          onChange={(e) => {
            setPage(1);
            setFilters((f) => ({ ...f, role: e.target.value }));
          }}
          aria-label="Filter by author role"
        >
          <option value="">Everyone</option>
          <option value="GUEST">Guests</option>
          <option value="HOTEL_ADMIN">Hotel admins</option>
          <option value="HOTEL_STAFF">Hotel staff</option>
          <option value="MAIN_ADMIN">Platform admins</option>
        </select>

        <input
          className="input"
          placeholder="Search captions"
          defaultValue={filters.q}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            setPage(1);
            setFilters((f) => ({ ...f, q: e.currentTarget.value }));
          }}
          aria-label="Search captions"
        />

        <span className={styles.count}>{data?.total ?? 0} posts</span>
      </div>

      {loading && !data ? (
        <Spinner />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={run} />
      ) : !items.length ? (
        <Empty title="Nothing matches" hint="Try a different filter." />
      ) : (
        <div className={styles.column}>
          {items.map((post) => (
            <FeedPostCard
              key={post.id}
              post={post}
              onToggleLike={like}
              onToggleSave={save}
              onOpenComments={setCommentsFor}
              onOpenLikes={setLikesFor}
              onDelete={remove}
              // The platform admin may remove anything.
              canDelete={user?.role === "MAIN_ADMIN"}
            />
          ))}
        </div>
      )}

      {(data?.total || 0) > (data?.limit || 20) && (
        <div className={styles.bar}>
          {page > 1 && (
            <Button variant="ghost" onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
          )}
          {page * (data?.limit || 20) < (data?.total || 0) && (
            <Button variant="ghost" onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          )}
        </div>
      )}

      {commentsFor && (
        <FeedCommentSheet post={commentsFor} onClose={() => setCommentsFor(null)} />
      )}

      {likesFor && <LikesSheet post={likesFor} onClose={() => setLikesFor(null)} />}
    </>
  );
};

export const PanelFeed = ({ tab, scope = "hotel" }) => {
  const [composing, setComposing] = useState(false);
  const [nonce, setNonce] = useState(0);

  const mine = useCallback((params) => listMyPosts(params), []);
  const property = useCallback((params) => listHotelPosts({ ...params, page: 1 }), []);
  const explore = useCallback((params) => listFeed(params), []);

  if (tab === "comments") return <CommentInbox />;
  if (tab === "moderation") return <Moderation />;

  if (tab === "explore") {
    return (
      <PostList
        fetcher={explore}
        cacheKey="feed.global"
        emptyTitle="The feed is empty"
        emptyHint="Nobody has posted yet."
      />
    );
  }

  // "posts" — mine, or the whole property for a hotel panel.
  return (
    <>
      <PostList
        // Remounted after publishing, so the new post is at the top without
        // threading a refresh handle out of PostList.
        key={`${scope}-${nonce}`}
        fetcher={scope === "property" ? property : mine}
        cacheKey={scope === "property" ? "feed.hotelPosts" : "feed.mine"}
        emptyTitle="No posts yet"
        emptyHint="Share a photo to get started."
        onCompose={() => setComposing(true)}
      />

      {composing && (
        <FeedComposer
          onClose={() => setComposing(false)}
          onPosted={() => {
            setComposing(false);
            setNonce((n) => n + 1);
          }}
        />
      )}
    </>
  );
};

export default PanelFeed;
