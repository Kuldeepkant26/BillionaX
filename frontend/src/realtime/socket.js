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

  /*
   * Return the EXISTING socket whenever there is one, connected or not.
   *
   * The guard here used to be `socket?.connected`, which looks equivalent and
   * is not: a socket that is still handshaking — or one that reconnect or
   * reauthSocket has momentarily dropped — reports connected === false, so a
   * second caller fell through to disconnectSocket() and built a new one.
   * disconnectSocket() calls removeAllListeners(), so that tore every handler
   * off the socket the FIRST caller was still holding.
   *
   * Two hooks now call this on the same mount (useRealtime for notifications,
   * useHotelBillRealtime for the panel's bill list), so the second one silently
   * unsubscribed the first — and after a reauth it could unsubscribe itself.
   * That is why bills stopped updating in the panel: the listeners were
   * attached to a socket that had already been thrown away.
   *
   * socket.io reconnects on its own, so an existing-but-disconnected instance
   * is a socket that is coming back, not one to replace. Only a real teardown
   * (logout, or an explicit disconnectSocket) should ever null this out.
   */
  if (socket) return socket;

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
  if (!socket || !token) return;

  /*
   * A no-op when the token has not actually changed.
   *
   * useRealtime calls this from an effect keyed on accessToken, which fires on
   * MOUNT as well as on a rotation — so every panel mount used to drop and
   * re-open a socket that had just been opened. The reconnect keeps its
   * listeners, so this was never a correctness bug on its own, but it widened
   * the window in which the socket reported connected === false, which is
   * exactly what the old connectSocket guard mishandled.
   */
  if (socket.auth?.token === token) return;

  socket.auth = { token };
  // The same instance, so every listener attached to it survives the
  // handshake — replacing the socket here would unsubscribe both hooks.
  socket.disconnect().connect();
};
