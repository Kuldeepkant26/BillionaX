import { useEffect, useRef } from "react";
import { connectSocket } from "../realtime/socket.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Delivers support messages as they are sent.
 *
 * Used by both sides of the conversation: the guest's chat screen and the
 * admin panel's inbox listen to the same `support:message` event, and the
 * server decides who receives it by room (the guest's own room, and the admin
 * room). The payload carries `guestId` only on the admin side, which is how
 * the inbox knows which thread moved.
 *
 * This is the FOURTH consumer of the socket singleton (after useRealtime,
 * useBillRealtime and useFeedRealtime). Like those it uses .on/.off and never
 * removeAllListeners, which would tear the others' handlers off the shared
 * instance — see socket.js for the bug that caused.
 *
 * `onResync` fires on connect and on tab focus, so a message that arrived
 * while the tab was backgrounded heals on the next look rather than needing a
 * delivery queue.
 */
export const useSupportRealtime = ({ onMessage, onResync } = {}) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  // Held in refs so an inline arrow from the page does not detach and reattach
  // the listener on every render — which, on a chat screen that re-renders on
  // every keystroke in the composer, would be every keystroke.
  const messageRef = useRef(onMessage);
  const resyncRef = useRef(onResync);
  useEffect(() => {
    messageRef.current = onMessage;
    resyncRef.current = onResync;
  });

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Returns ANY existing socket, connected or not — see socket.js for why
    // this must never be guarded on `socket?.connected`.
    const socket = connectSocket();
    if (!socket) return undefined;

    const onIncoming = (payload) => messageRef.current?.(payload);
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
