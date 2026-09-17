import { useEffect, useRef } from "react";
import { connectSocket } from "../realtime/socket.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Delivers support messages as they are sent.
 *
 * Used by every side of every conversation: the guest's chat screens, the
 * hotel panel's queue and the admin panel's inbox all listen to the same
 * `support:message` event, and the server decides who receives it by room (the
 * guest's own room, the hotel's room, and the admin room).
 *
 * This is the FOURTH consumer of the socket singleton (after useRealtime,
 * useBillRealtime and useFeedRealtime). Like those it uses .on/.off and never
 * removeAllListeners, which would tear the others' handlers off the shared
 * instance — see socket.js for the bug that caused.
 *
 * `onResync` fires on connect and on tab focus, so a message that arrived
 * while the tab was backgrounded heals on the next look rather than needing a
 * delivery queue.
 *
 * ---- filtering ----
 *
 * `party` and `hotelId` narrow what reaches onMessage, and a screen showing
 * ONE thread should always pass them.
 *
 * With three channels on one event name, an unfiltered handler is now a real
 * bug rather than a theoretical one: a guest sitting in their Billionax thread
 * is also in their hotel's delivery path, so a message from the front desk
 * would otherwise append itself to the platform conversation. Filtering here
 * rather than in each page means a new screen is correct by default instead of
 * correct only if its author remembered.
 *
 * A payload with no `party` is treated as the platform GUEST channel, since
 * that is what the server has always omitted it for.
 */
export const useSupportRealtime = ({ onMessage, onResync, party, hotelId } = {}) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  // Held in refs so an inline arrow from the page does not detach and reattach
  // the listener on every render — which, on a chat screen that re-renders on
  // every keystroke in the composer, would be every keystroke.
  const messageRef = useRef(onMessage);
  const resyncRef = useRef(onResync);
  // The filter rides in a ref for the same reason the callbacks do: a guest
  // switching hotels changes hotelId, and rebuilding the socket listener on
  // that would drop messages arriving mid-switch.
  const filterRef = useRef({ party, hotelId });
  useEffect(() => {
    messageRef.current = onMessage;
    resyncRef.current = onResync;
    filterRef.current = { party, hotelId };
  });

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Returns ANY existing socket, connected or not — see socket.js for why
    // this must never be guarded on `socket?.connected`.
    const socket = connectSocket();
    if (!socket) return undefined;

    const onIncoming = (payload) => {
      const want = filterRef.current;

      // No party asked for means "everything" — the admin and hotel inboxes,
      // which route by thread rather than watching one.
      if (want.party) {
        // Absent party on the wire is the platform guest channel, which
        // predates the field.
        const got = payload?.party || "GUEST";
        if (got !== want.party) return;

        // Compared as strings: an ObjectId arrives serialised, and `===` on a
        // mixed pair is silently false — which would drop every message.
        if (want.hotelId && String(payload?.hotelId || "") !== String(want.hotelId)) return;
      }

      messageRef.current?.(payload);
    };
    const resync = () => resyncRef.current?.();
    const onVisible = () => document.visibilityState === "visible" && resync();

    socket.on("support:message", onIncoming);
    socket.on("connect", resync);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("support:message", onIncoming);
      socket.off("connect", resync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated]);
};
