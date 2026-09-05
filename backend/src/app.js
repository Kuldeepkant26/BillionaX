import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import { env, isProduction } from "./config/env.js";
import routes from "./routes/index.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";

const app = express();

// Required for correct client IPs (and therefore rate limiting) behind a proxy.
app.set("trust proxy", 1);

app.use(helmet());

/**
 * Allowlist rather than a single origin, so the app works from localhost and
 * from a phone on the LAN at the same time. Requests with no Origin (curl,
 * native apps, same-origin) are allowed through.
 *
 * Exported because socket.io handshakes never traverse Express middleware and
 * therefore need their own cors block. Sharing this function is what keeps the
 * two from drifting — a drift would either break the LAN-phone workflow or
 * open the socket wider than the REST API.
 */
export const corsOrigin = (origin, callback) => {
  if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);

  // In development, accept any private-network address so a new device on the
  // Wi-Fi does not need a config change. Never in production.
  if (!isProduction && /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(origin)) {
    return callback(null, true);
  }

  return callback(new Error(`Origin not allowed by CORS: ${origin}`));
};

app.use(cors({ origin: corsOrigin, credentials: true }));
/**
 * Webhooks mount BEFORE express.json().
 *
 * Their signature is an HMAC over the exact bytes the provider sent, and a
 * parsed-then-reserialised body no longer matches it. The route uses
 * express.raw() to keep the original buffer.
 */
app.use("/api/v1/webhooks", webhookRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(isProduction ? "combined" : "dev"));

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
