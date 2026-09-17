/**
 * Help-centre chat state: the guest's unread reply count, and whether the feed
 * is switched on at all.
 *
 * `feedEnabled` lives here rather than in themeSlice because it is not a theme
 * — but it arrives on exactly the same calls (publicConfig and the memberships
 * bootstrap), and for the same reason: the bottom nav is built from it, so it
 * has to be right on the first paint.
 *
 * It is NOT persisted, deliberately, unlike accent and font. Those are painted
 * before React loads by the pre-paint script in index.html, so a stale value
 * costs one frame of the wrong colour. This one decides whether a TAB EXISTS,
 * and a persisted stale `true` would show a Feed tab that 404s until the
 * config call lands. Defaulting to false and letting the server turn it on is
 * the failure that does the least damage.
 */
export const createSupportSlice = (set, get) => ({
  /** Unread support messages. Drives the guest's Help dot and the panels' badge. */
  supportUnread: 0,

  /**
   * Which write produced the current `supportUnread`.
   *
   * Several callers write this count — a page load, a tab focus, a socket
   * nudge, and the response to marking a thread read — and their requests can
   * finish out of order. Without this the LAST response to arrive wins even
   * when it carries the OLDEST truth, which is how a thread stayed badged
   * after being read: a count fetched before the read landed after it.
   *
   * A monotonic ticket, NOT a clock. Two requests issued in the same
   * millisecond are indistinguishable by time, and a timestamp also cannot
   * express "this local event supersedes anything already in flight" without
   * using a sentinel that then blocks every future write. A counter that only
   * ever goes up says exactly what is needed: which write is newer.
   *
   * Not persisted, like the rest of this slice.
   */
  supportUnreadSeq: 0,

  /**
   * Reserves a ticket for a count that is about to be fetched.
   *
   * Callers take one BEFORE issuing the request and hand it back with the
   * response. A response holding an older ticket than the store's is a slow
   * reply that has been overtaken, and is dropped.
   */
  nextSupportSeq: () => {
    const supportUnreadSeq = get().supportUnreadSeq + 1;
    set({ supportUnreadSeq });
    return supportUnreadSeq;
  },

  /**
   * Writes a FETCHED count, ignoring anything a newer write has superseded.
   *
   * `seq` comes from nextSupportSeq(). Omitting it means "I have not raced
   * anybody" and takes a fresh ticket, which is what the one-off callers want.
   */
  setSupportUnread: (supportUnread, seq) => {
    const ticket = seq ?? get().supportUnreadSeq + 1;
    if (ticket < get().supportUnreadSeq) return;
    set({ supportUnread: Math.max(0, supportUnread), supportUnreadSeq: ticket });
  },

  /*
   * Local events: things that just happened in this tab.
   *
   * They take a FRESH ticket rather than a sentinel, so they beat every count
   * already in flight (all of which were computed before the event) while
   * still losing to the next fetch issued after them. That is the property
   * Infinity could not give — it won forever and froze the badge.
   */
  bumpSupportUnread: () =>
    set((s) => ({
      supportUnread: s.supportUnread + 1,
      supportUnreadSeq: s.supportUnreadSeq + 1,
    })),

  clearSupportUnread: () =>
    set((s) => ({ supportUnread: 0, supportUnreadSeq: s.supportUnreadSeq + 1 })),

  /**
   * Unread GUEST messages waiting on this property's front desk.
   *
   * A separate key from supportUnread rather than a second writer of it. That
   * one is "my unread replies" on whichever platform thread this session owns,
   * and the two are genuinely different numbers that appear on two nav items
   * at the same time — a manager can have an unanswered question with
   * Billionax and six guests waiting, and one counter cannot say both.
   *
   * No seq ticket, unlike supportUnread: every write here is a server count
   * returned by the read that caused it, and the panel has a single writer.
   * The race that made the ticket necessary there does not exist here, and
   * inventing one would be ceremony rather than safety.
   */
  guestChatsUnread: 0,

  setGuestChatsUnread: (n) => set({ guestChatsUnread: Math.max(0, n || 0) }),

  bumpGuestChatsUnread: () => set((s) => ({ guestChatsUnread: s.guestChatsUnread + 1 })),

  /**
   * A GUEST's unread replies from their hotels, split by property.
   *
   * The guest-side counterpart of guestChatsUnread, and a map rather than a
   * number because a guest belongs to several hotels and the Help screen dots
   * each row separately. The total is derived (hotelUnreadTotal) rather than
   * stored, so the two can never disagree — the bug that a second counter
   * always eventually produces.
   *
   * Kept OUT of supportUnread deliberately. That key is the platform thread,
   * and merging them would mean marking one conversation read clears a dot
   * that belongs to the other.
   */
  hotelUnread: {},

  /** Replaces the whole map from a server count. */
  setHotelUnread: (byHotel) => set({ hotelUnread: { ...(byHotel || {}) } }),

  /** One property's count, from a socket push. */
  bumpHotelUnread: (hotelId) =>
    set((s) => {
      if (!hotelId) return s;
      const key = String(hotelId);
      return { hotelUnread: { ...s.hotelUnread, [key]: (s.hotelUnread[key] || 0) + 1 } };
    }),

  /** Reading one hotel's thread clears only that hotel. */
  clearHotelUnread: (hotelId) =>
    set((s) => {
      if (!hotelId) return s;
      const key = String(hotelId);
      if (!s.hotelUnread[key]) return s;
      const next = { ...s.hotelUnread };
      delete next[key];
      return { hotelUnread: next };
    }),

  feedEnabled: false,
  // Coerced rather than trusted: an older API build omits the key entirely,
  // and `undefined` in the nav filter would read as "hide", which is right,
  // but `set` should still store a boolean rather than undefined.
  setFeedEnabled: (feedEnabled) => set({ feedEnabled: Boolean(feedEnabled) }),
});

/**
 * The guest's total unread across every hotel thread.
 *
 * A selector rather than a stored number, so it cannot drift from the map it
 * summarises. Used by the bottom nav's Help dot; the Help screen itself reads
 * the map directly to dot individual properties.
 *
 * Defined here beside the state it reads rather than in the component, because
 * two components need the same sum and a second implementation is how they
 * start disagreeing.
 */
export const selectHotelUnreadTotal = (s) =>
  Object.values(s.hotelUnread || {}).reduce((total, n) => total + (n || 0), 0);
