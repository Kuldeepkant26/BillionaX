/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { supportUnreadCount } from "../api/guest.api.js";
import { useSupportRealtime } from "./useSupportRealtime.js";
import { useAppStore } from "../store/useAppStore.js";
import { useLocation } from "react-router-dom";

/**
 * Keeps the dot on the Help tab honest, from anywhere in the guest app.
 *
 * Lives in the shell rather than on the help screens, because the whole point
 * of the dot is to be seen by a guest who is somewhere ELSE. This is the same
 * mistake that once left the hotel panel stale: a correct hook that nothing
 * called.
 *
 * Counts come from the server on mount, on reconnect and on tab focus; the
 * socket only nudges the number between those. That is the same arrangement as
 * useRealtime's unread badge, and it means a missed push heals itself.
 */
export const useSupportBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setSupportUnread = useAppStore((s) => s.setSupportUnread);
  const nextSupportSeq = useAppStore((s) => s.nextSupportSeq);
  const bumpSupportUnread = useAppStore((s) => s.bumpSupportUnread);
  const { pathname } = useLocation();

  const enabled = isAuthenticated && role === "GUEST";

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
      // The guest's own message is echoed back to them so a second device
      // stays in step (see support.service.js). Counting it would put a dot on
      // the tab for something they just typed.
      if (payload?.message?.sender !== "ADMIN") return;
      // Not counted while the guest is reading the thread — SupportChatPage
      // marks it read on arrival, and a dot that appears and vanishes is worse
      // than no dot.
      if (pathname.startsWith("/app/help/chat")) return;
      bumpSupportUnread();
    },
    onResync: sync,
  });
};
