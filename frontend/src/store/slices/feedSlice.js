/**
 * The "N new posts" pill, and nothing else.
 *
 * Posts themselves live in useFeedList and the async cache, not here — this
 * slice holds only the count of posts that have arrived since the reader's feed
 * was last loaded.
 *
 * DELIBERATELY NOT IN partialize. Every other slice has an entry there, so its
 * absence looks like an oversight and is not: a persisted "3 new posts" badge
 * would survive a reload with nothing behind it to clear it, and would sit
 * there permanently. Ephemeral is the correct lifetime for this.
 */
export const createFeedSlice = (set) => ({
  newPostCount: 0,

  /** A feed:post push arrived. The number is all the pill needs. */
  bumpNewPosts: () => set((s) => ({ newPostCount: s.newPostCount + 1 })),

  /** The reader refreshed, so the pill has served its purpose. */
  clearNewPosts: () => set({ newPostCount: 0 }),
});
