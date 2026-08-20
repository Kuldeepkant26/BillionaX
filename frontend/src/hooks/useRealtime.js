/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore.js";
import { connectSocket, disconnectSocket, reauthSocket } from "../realtime/socket.js";

/**
 * Connects the guest socket and keeps the unread badge live.
 *
 * The socket is an optimisation, not the source of truth: every connect,
 * reconnect and tab-focus re-derives the count from the server. Because that
 * count comes from the ledger rather than from delivered pushes, a resync is
 * always exactly right — which is why no delivery queue is needed.
 */
export const useRealtime = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
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

    // The server warns ~30s before the token expires, then drops the socket.
    // Reconnecting with whatever token the store now holds is enough: if axios
    // has rotated it, the new one is picked up here.
    const onExpiring = () => reauthSocket(useAppStore.getState().accessToken);

    const onVisible = () => {
      if (document.visibilityState === "visible") syncUnread();
    };

    socket.on("connect", onConnect);
    socket.on("notification:new", onNew);
    socket.on("notification:read", onRead);
    socket.on("auth:expiring", onExpiring);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("connect", onConnect);
      socket.off("notification:new", onNew);
      socket.off("notification:read", onRead);
      socket.off("auth:expiring", onExpiring);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated]);

  // A rotated token needs a fresh handshake, since rooms are derived from it.
  useEffect(() => {
    if (isAuthenticated && accessToken) reauthSocket(accessToken);
  }, [accessToken]);
};
