/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { supportUnreadCount } from "../api/hotel.api.js";
import { useSupportRealtime } from "./useSupportRealtime.js";
import { useAppStore } from "../store/useAppStore.js";
import { useLocation } from "react-router-dom";

/**
 * Keeps the count on the hotel panel's "Contact Billionax" nav item live.
 *
 * The third of the three support badges, alongside useSupportBadge (guest app)
 * and useAdminSupportBadge (admin panel). All three write the same
 * `supportUnread` store key, which is safe because a session is exactly one
 * role — nobody mounts two of these shells at once.
 *
 * HOTEL_ADMIN only, matching the API. A HOTEL_STAFF session would 403 on every
 * poll, so it never starts one.
 */
export const useHotelSupportBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const myId = useAppStore((s) => s.user?.id);
  const setSupportUnread = useAppStore((s) => s.setSupportUnread);
  const nextSupportSeq = useAppStore((s) => s.nextSupportSeq);
  const bumpSupportUnread = useAppStore((s) => s.bumpSupportUnread);
  const { pathname } = useLocation();

  const enabled = isAuthenticated && role === "HOTEL_ADMIN";

  const sync = () => {
    if (!enabled) return;
    // A ticket taken BEFORE the request goes out, so a slow response cannot
    // overwrite a fresher count written while it was in flight — a tab focus
    // firing this while a thread is being marked read is exactly that case.
    const seq = nextSupportSeq();
    supportUnreadCount()
      .then((data) => {
        if (typeof data?.unread === "number") setSupportUnread(data.unread, seq);
      })
      .catch(() => {
        // A badge is not worth a visible failure.
      });
  };

  useEffect(() => {
    sync();
  }, [enabled]);

  useSupportRealtime({
    onMessage: (payload) => {
      // Belt and braces — the server pushes only this account's own thread to
      // it. See HotelSupportPage for the same guard and the same reasoning.
      if (payload?.userId && myId && String(payload.userId) !== String(myId)) return;
      // Only a platform reply is news; our own message is echoed back to keep
      // a second tab in step and must not badge the person who typed it.
      if (payload?.message?.sender !== "ADMIN") return;
      // Not counted while the manager is reading the thread — the page marks
      // it read on arrival, and a badge that appears and vanishes is worse
      // than no badge.
      if (pathname.startsWith("/hotel/support")) return;
      bumpSupportUnread();
    },
    onResync: sync,
  });
};
