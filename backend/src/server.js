import http from "node:http";
import mongoose from "mongoose";
import app from "./app.js";
import { env, validateEnv } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { logger } from "./utils/logger.js";
import { createRealtime, closeRealtime } from "./realtime/index.js";

let server;

const shutdown = async (signal, code = 0) => {
  logger.info(`${signal} received, shutting down gracefully`);
  // Sockets must go FIRST. They are open connections that keep the HTTP
  // server's close() callback from ever firing, so closing in the other order
  // hangs the process instead of exiting.
  await closeRealtime();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close(false);
  process.exit(code);
};

const startServer = async () => {
  validateEnv();
  await connectDB();

  // An explicit http.Server rather than app.listen(): socket.io needs the
  // server instance to attach its upgrade handler to.
  server = http.createServer(app);
  createRealtime(server);

  server.listen(env.port, () => {
    logger.info(`Server running in ${env.nodeEnv} mode on port ${env.port}`);
  });
};

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason?.message || reason}`);
  shutdown("unhandledRejection", 1);
});

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  shutdown("uncaughtException", 1);
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer().catch((error) => {
  logger.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});
