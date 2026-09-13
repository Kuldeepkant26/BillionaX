import { useEffect, useRef } from "react";
import { connectSocket } from "../realtime/socket.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Raises the "new posts" pill when someone publishes.
 *
 * The push carries an id, not a post — the server is deliberately stingy here,
 * because this event reaches every connected socket. So this hook does not
 * render anything from the payload; it counts, and the reader's tap refetches.
 * The socket is an optimisation, not the source of truth.
 *
 * `onResync` fires on connect and on tab focus, so a push missed while the tab
 * was backgrounded or the connection was down heals on its own. That is why
 * there is no delivery queue anywhere in this app.
 *
 * This is the THIRD consumer of the socket singleton (after useRealtime and
 * useBillRealtime). It therefore uses .on/.off and never removeAllListeners,
 * which would tear the other two hooks' handlers off the shared instance — the
 * bug that once broke live updates in the hotel panel.
 */
export const useFeedRealtime = ({ onNewPost, onResync } = {}) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const myId = useAppStore((s) => s.user?.id);

  // Held in refs so an inline arrow from the page does not re-run the effect —
  // and, more importantly, does not detach and reattach the listeners on every
  // render of the feed.
  const newPostRef = useRef(onNewPost);
  const resyncRef = useRef(onResync);
  useEffect(() => {
    newPostRef.current = onNewPost;
    resyncRef.current = onResync;
  });

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    // Returns ANY existing socket, connected or not — see socket.js for why
    // this must never be guarded on `socket?.connected`.
    const socket = connectSocket();
    if (!socket) return undefined;

    const onPost = (payload) => {
      // Your own post is already at the top of your feed; being told about it
      // would be a pill you raised for yourself.
      if (payload?.authorId && myId && String(payload.authorId) === String(myId)) return;
      newPostRef.current?.(payload);
    };

    const resync = () => resyncRef.current?.();
    const onVisible = () => document.visibilityState === "visible" && resync();

    socket.on("feed:post", onPost);
    socket.on("connect", resync);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("feed:post", onPost);
      socket.off("connect", resync);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, myId]);
};
