/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore.js";
import { connectSocket, disconnectSocket, reauthSocket } from "../realtime/socket.js";

/**
 * Connects the socket for every signed-in role, and keeps the guest unread
 * badge live on top of it.
 *
 * The socket connection itself is shared — PanelLayout mounts this same hook
 * so hotel and admin staff get the bill-arrival push too. But the unread
 * NOTIFICATION badge is a guest concept: `/guest/notifications/unread-count`
 * 403s for every other role, so syncUnread and the notification: events are
 * gated to GUEST rather than firing (and failing) on every panel page load.
 */
export const useRealtime = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isGuest = useAppStore((s) => s.user?.role === "GUEST");
  const accessToken = useAppStore((s) => s.accessToken);
  const syncUnread = useAppStore((s) => s.syncUnread);
  const setUnread = useAppStore((s) => s.setUnread);
  const receivePush = useAppStore((s) => s.receivePush);
  const toast = useAppStore((s) => s.toast);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
      return undefined;
    }

    const socket = connectSocket();
    if (!socket) return undefined;

    // The server warns ~30s before the token expires, then drops the socket.
    // Reconnecting with whatever token the store now holds is enough: if axios
    // has rotated it, the new one is picked up here.
    const onExpiring = () => reauthSocket(useAppStore.getState().accessToken);
    socket.on("auth:expiring", onExpiring);

    if (!isGuest) {
      return () => {
        socket.off("auth:expiring", onExpiring);
      };
    }

    syncUnread();

    const onConnect = () => syncUnread();

    const onNew = ({ item, unread }) => {
      if (typeof unread === "number") setUnread(unread);
      // Publishes the item so an already-open Alerts feed can show it
      // immediately, rather than only on the next mount.
      receivePush(item);
      if (item?.title) toast(item.title, item.coins > 0 ? "success" : undefined);
    };

    const onRead = ({ unread }) => setUnread(unread ?? 0);

    const onVisible = () => {
      if (document.visibilityState === "visible") syncUnread();
    };

    socket.on("connect", onConnect);
    socket.on("notification:new", onNew);
    socket.on("notification:read", onRead);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("connect", onConnect);
      socket.off("notification:new", onNew);
      socket.off("notification:read", onRead);
      socket.off("auth:expiring", onExpiring);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, isGuest]);

  // A rotated token needs a fresh handshake, since rooms are derived from it.
  useEffect(() => {
    if (isAuthenticated && accessToken) reauthSocket(accessToken);
  }, [accessToken]);
};
