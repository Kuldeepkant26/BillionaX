/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { supportUnreadCount } from "../api/admin.api.js";
import { useSupportRealtime } from "./useSupportRealtime.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Keeps the count on the admin panel's Support nav item live.
 *
 * The admin-side twin of useSupportBadge, and separate from it for two
 * reasons: it reads a different endpoint (the whole queue, not one guest's
 * thread), and it is mounted by AdminPanelLayout rather than the shared
 * PanelLayout — hotel staff have no support queue, so polling one from the
 * shell they share would be a guaranteed 403 on every hotel panel load.
 *
 * Both hooks write the same `supportUnread` store key. That is safe because a
 * session is one role: a guest never mounts the admin panel and an admin never
 * mounts the guest shell.
 */
export const useAdminSupportBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setSupportUnread = useAppStore((s) => s.setSupportUnread);
  const nextSupportSeq = useAppStore((s) => s.nextSupportSeq);

  const enabled = isAuthenticated && role === "MAIN_ADMIN";

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
    // Re-counted from the server rather than incremented: an admin's own reply
    // and a second admin marking a thread read both move this number, and only
    // the server knows the result. The push is just the signal to go and ask.
    //
    // Deliberately UNFILTERED by party, unlike the other three badges. This
    // one counts both platform queues at once, so it has to refetch for either
    // — and the admin room carries only those two: the guest-to-hotel channel
    // is emitted to the property, never here (see sendFromOwner). If that ever
    // changes, `unreadForPlatform` still ignores HOTEL_GUEST rows when it sums
    // the total, so a stray push would cost a wasted request rather than a
    // wrong number.
    onMessage: sync,
    onResync: sync,
  });
};
