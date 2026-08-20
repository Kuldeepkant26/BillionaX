import { io } from "socket.io-client";
import { getAppState } from "../store/useAppStore.js";

/**
 * Same derivation as axiosInstance's BASE_URL, minus the /api/v1 suffix — the
 * socket path is mounted at the server root, not under the API prefix.
 */
const SOCKET_URL =
  (import.meta.env.VITE_API_BASE_URL || "").replace(/\/api\/v1\/?$/, "") ||
  `${window.location.protocol}//${window.location.hostname}:${import.meta.env.VITE_API_PORT || "5001"}`;

let socket = null;

export const getSocket = () => socket;

export const connectSocket = () => {
  const { accessToken, isAuthenticated } = getAppState();
  if (!isAuthenticated || !accessToken) return null;
  if (socket?.connected) return socket;
  if (socket) disconnectSocket();

  socket = io(SOCKET_URL, {
    path: "/socket.io",
    auth: { token: accessToken },
    withCredentials: true,
    // Polling fallback matters on hotel Wi-Fi and behind corporate proxies.
    transports: ["websocket", "polling"],
    reconnectionAttempts: Infinity,
    reconnectionDelayMax: 10_000,
  });

  return socket;
};

export const disconnectSocket = () => {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
};

/**
 * Re-handshakes with a fresh token.
 *
 * The access token lives 15 minutes but a socket connection is long-lived, and
 * socket.io only checks credentials at handshake. Reconnecting re-runs the
 * server's io.use(), so rooms and the expiry timer are recomputed — and it
 * keeps exactly one token class rather than inventing a longer-lived one.
 */
export const reauthSocket = (token) => {
  if (!socket) return;
  socket.auth = { token };
  socket.disconnect().connect();
};
