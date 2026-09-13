import { useCallback } from "react";
import { deletePost, togglePostLike, togglePostSave } from "../api/feed.api.js";
import { invalidateCache } from "./asyncCache.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Like, save and delete, shared by every screen that renders a post.
 *
 * `patch(postId, changes)` and `remove(postId)` are supplied by the caller, so
 * this works against useFeedList, a useAsync single post, or a panel table
 * without knowing which.
 *
 * THE CACHE RULE, and it is the easy one to get wrong:
 *
 *   Invalidate what changed SHAPE, never what changed VALUE.
 *
 * A like changes a number on a row that is already on screen, so it updates in
 * place. invalidateCache is a SUBSTRING match, so a careless invalidateCache
 * ("feed") in the like handler would drop the whole accumulated feed, re-seed
 * it from an empty cache and throw the reader back to the top of an infinite
 * scroll mid-read. A delete genuinely changes which rows the lists contain, so
 * it invalidates broadly.
 */
export const useFeedActions = ({ patch, remove } = {}) => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);

  /**
   * Optimistic, then corrected by the server's authoritative count.
   *
   * Waiting for the round trip before filling the heart feels broken on hotel
   * wifi; reverting on failure keeps the lie short.
   */
  const like = useCallback(
    async (post) => {
      if (!post?.id) return;
      const before = { likedByMe: post.likedByMe, likeCount: post.likeCount };

      patch?.(post.id, {
        likedByMe: !before.likedByMe,
        likeCount: Math.max(0, (before.likeCount || 0) + (before.likedByMe ? -1 : 1)),
      });

      try {
        // The count is read back server-side, so this is the truth even when
        // two devices tap at once.
        const res = await togglePostLike(post.id);
        patch?.(post.id, { likedByMe: res.likedByMe, likeCount: res.likeCount });
      } catch (error) {
        patch?.(post.id, before);
        toastError(error.message || "Could not update that like");
      }
    },
    [patch, toastError]
  );

  const save = useCallback(
    async (post) => {
      if (!post?.id) return;
      const before = Boolean(post.savedByMe);
      patch?.(post.id, { savedByMe: !before });

      try {
        const res = await togglePostSave(post.id);
        patch?.(post.id, { savedByMe: res.savedByMe });
        // Only the saved LIST changed shape. The feed did not, so it keeps its
        // scroll position.
        invalidateCache("feed.saved");
      } catch (error) {
        patch?.(post.id, { savedByMe: before });
        toastError(error.message || "Could not update that save");
      }
    },
    [patch, toastError]
  );

  const remove_ = useCallback(
    async (post) => {
      if (!post?.id) return;
      try {
        await deletePost(post.id);
        remove?.(post.id);
        // Broad on purpose: a deleted post can be in the feed, a profile, a
        // moderation table and other people's saved lists all at once.
        invalidateCache("feed.");
        toastSuccess("Post deleted");
      } catch (error) {
        toastError(error.message || "Could not delete that post");
      }
    },
    [remove, toastError, toastSuccess]
  );

  return { like, save, remove: remove_ };
};
