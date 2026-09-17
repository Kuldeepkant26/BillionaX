/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { guestThreadUnreadCount } from "../api/hotel.api.js";
import { useSupportRealtime } from "./useSupportRealtime.js";
import { useAppStore } from "../store/useAppStore.js";
import { useLocation } from "react-router-dom";

/**
 * Keeps the count on the hotel panel's "Guest messages" nav item live.
 *
 * The fourth support badge, and the first that is not about the session's own
 * thread: this one counts what a whole PROPERTY has waiting, so it writes
 * guestChatsUnread rather than the supportUnread key the other three share.
 * Both can be non-zero at once on this panel — a manager with an unanswered
 * question to Billionax and six guests waiting on the desk — which is why they
 * are two keys and not one.
 *
 * Unlike useHotelSupportBadge this runs for HOTEL_STAFF too, matching the
 * routes: the front desk answers this queue.
 *
 * Counts come from the server on mount, on reconnect and on tab focus; the
 * socket only nudges the number between those, so a missed push heals itself.
 */
export const useHotelGuestChatsBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setGuestChatsUnread = useAppStore((s) => s.setGuestChatsUnread);
  const bumpGuestChatsUnread = useAppStore((s) => s.bumpGuestChatsUnread);
  const { pathname } = useLocation();

  const enabled =
    isAuthenticated && (role === "HOTEL_ADMIN" || role === "HOTEL_STAFF");

  const sync = () => {
    if (!enabled) return;
    guestThreadUnreadCount()
      .then((data) => {
        if (typeof data?.unread === "number") setGuestChatsUnread(data.unread);
      })
      .catch(() => {
        // A badge is not worth a visible failure.
      });
  };

  useEffect(() => {
    sync();
  }, [enabled]);

  useSupportRealtime({
    // The guest queue only. This account's own thread with the platform
    // arrives on the same event and is counted by useHotelSupportBadge.
    party: "HOTEL_GUEST",
    onMessage: (payload) => {
      // GUEST is the thread's owner — the guest. Our own reply is echoed back
      // to the room so a colleague's screen stays in step, and counting it
      // would badge the desk for something it just sent.
      if (payload?.message?.sender !== "GUEST") return;
      // Not counted while somebody here is reading the queue: the page marks
      // the open thread read on arrival, and a badge that appears and vanishes
      // is worse than no badge.
      if (pathname.startsWith("/hotel/messages")) return;
      bumpGuestChatsUnread();
    },
    onResync: sync,
  });
};
