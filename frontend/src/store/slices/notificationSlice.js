import { getUnreadCount } from "../../api/notification.api.js";

/**
 * Unread badge state.
 *
 * Deliberately NOT persisted: the count is derived from the ledger server-side,
 * so a resync is always exactly correct and a stale persisted number would only
 * ever be wrong. syncUnread() is called on mount, on socket connect/reconnect,
 * and when the tab becomes visible again.
 */
export const createNotificationSlice = (set, get) => ({
  unread: 0,

  /**
   * Counter bumped on every live push. The open feed watches it and refetches,
   * so a notification that arrives while the guest is already looking at the
   * Alerts tab appears without needing a reload or a tab switch.
   */
  feedRevision: 0,

  /** The item from the most recent push, prepended optimistically. */
  lastPushed: null,

  setUnread: (unread) => set({ unread: Math.max(0, unread) }),

  /** Optimistic bump for a live push, before the next authoritative sync. */
  bumpUnread: () => set({ unread: get().unread + 1 }),

  /** Called by the socket handler for every incoming notification. */
  receivePush: (item) =>
    set({ lastPushed: item || null, feedRevision: get().feedRevision + 1 }),

  clearUnread: () => set({ unread: 0 }),

  syncUnread: async () => {
    // Sockets are lossy: a push emitted while the phone was offline is simply
    // gone. Re-deriving from the server is what makes a missed push heal
    // itself, instead of needing a durable delivery queue.
    try {
      const data = await getUnreadCount();
      set({ unread: data?.unread ?? 0 });
    } catch {
      // A failed sync must never break the app; the next one will correct it.
    }
  },
});
