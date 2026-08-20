import { Server } from "socket.io";
import { corsOrigin } from "../app.js";
import { logger } from "../utils/logger.js";
import { verifyAccessToken } from "../utils/token.util.js";
import { User } from "../models/user.model.js";
import { ROLES } from "../config/constants.js";
import { attachIo, detachIo, guestRoom, hotelRoom } from "./emitter.js";

let io = null;

/** Warn 30s before the token expires, then drop 10s later if not re-authed. */
const EXPIRY_WARNING_MS = 30_000;
const EXPIRY_GRACE_MS = 10_000;

export const createRealtime = (httpServer) => {
  io = new Server(httpServer, {
    path: "/socket.io",
    // Its own cors block: socket handshakes do not run Express middleware.
    cors: { origin: corsOrigin, credentials: true },
    // Polling fallback matters — hotel Wi-Fi and corporate proxies break WS.
    transports: ["websocket", "polling"],
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        String(socket.handshake.headers.authorization || "").replace(/^Bearer /, "");

      if (!token) return next(new Error("UNAUTHENTICATED"));

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select("role hotelId isActive");

      if (!user) return next(new Error("UNAUTHENTICATED"));
      if (!user.isActive) return next(new Error("FORBIDDEN"));

      // Room membership is derived ONLY from the database record, never from
      // handshake data. This is the socket-side equivalent of requireSameHotel:
      // a client that sends its own hotelId has it ignored. There is
      // deliberately no "subscribe" event, for the same reason.
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      socket.data.hotelId = user.hotelId ? String(user.hotelId) : null;
      socket.data.tokenExp = payload.exp;

      return next();
    } catch (error) {
      return next(new Error(error?.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    const { userId, role, hotelId, tokenExp } = socket.data;

    if (role === ROLES.GUEST) socket.join(guestRoom(userId));
    if ((role === ROLES.HOTEL_ADMIN || role === ROLES.HOTEL_STAFF) && hotelId) {
      socket.join(hotelRoom(hotelId));
    }
    // MAIN_ADMIN joins no hotel room: they have no hotelId, and a room named
    // from client input is exactly the leak requireSameHotel prevents.

    // A socket outlives its 15-minute access token, and socket.io only checks
    // credentials at handshake. Bound the connection to the token's lifetime so
    // a deactivated user cannot keep receiving pushes indefinitely.
    if (tokenExp) {
      const untilWarning = tokenExp * 1000 - Date.now() - EXPIRY_WARNING_MS;
      socket.data.expiryTimer = setTimeout(() => {
        socket.emit("auth:expiring");
        socket.data.killTimer = setTimeout(() => socket.disconnect(true), EXPIRY_GRACE_MS);
      }, Math.max(0, untilWarning));
    }

    socket.emit("ready", { rooms: [...socket.rooms].filter((r) => r !== socket.id) });

    socket.on("disconnect", () => {
      clearTimeout(socket.data.expiryTimer);
      clearTimeout(socket.data.killTimer);
    });
  });

  attachIo(io);
  logger.info("Realtime gateway attached");
  return io;
};

export const closeRealtime = async () => {
  if (!io) return;

  // Force clients off first. io.close() waits for them to leave on their own,
  // and a phone with the app backgrounded never will — the process would hang
  // on shutdown instead of exiting.
  io.disconnectSockets(true);
  await new Promise((resolve) => io.close(resolve));

  detachIo();
  io = null;
};
