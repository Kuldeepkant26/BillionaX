import dotenv from "dotenv";

dotenv.config();

const toBool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
};

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const env = {
  port: toInt(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || "development",
  mongoUri: process.env.MONGO_URI,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  // Comma-separated list, so the app can be opened from a phone on the LAN
  // without breaking localhost. Falls back to clientUrl.
  clientOrigins: (process.env.CLIENT_ORIGINS || process.env.CLIENT_URL || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
    refreshCookieName: "gw_refresh",
    refreshMaxAgeMs: toInt(process.env.JWT_REFRESH_MAX_AGE_DAYS, 30) * 24 * 60 * 60 * 1000,
  },

  otp: {
    provider: process.env.OTP_PROVIDER || "console",
    expiresMinutes: toInt(process.env.OTP_EXPIRES_MINUTES, 5),
    maxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
    length: toInt(process.env.OTP_LENGTH, 4),
  },

  /**
   * Media uploads. Deliberately NOT in REQUIRED: the platform runs fine
   * without it — uploads simply report themselves unavailable — so a missing
   * key must not stop the server booting.
   *
   * The secret signs upload requests and can delete anything in the library,
   * so it is server-side only. The cloud name is public (it appears in every
   * delivery URL); the browser is given a signature, never the secret.
   */
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    // Everything lands under one folder so the library stays navigable and a
    // stray upload is obvious.
    folder: process.env.CLOUDINARY_FOLDER || "billionax",
  },

  seed: {
    adminName: process.env.SEED_ADMIN_NAME || "Platform Owner",
    adminEmail: process.env.SEED_ADMIN_EMAIL || "admin@billionax.com",
    adminPassword: process.env.SEED_ADMIN_PASSWORD || "Admin@12345",
  },
};

export const isProduction = env.nodeEnv === "production";

/**
 * OTP verification bypass for development. Hard-forced off in production so a
 * stray .env can never enable it on a live deployment.
 */
export const otpDevBypass = isProduction ? false : toBool(process.env.OTP_DEV_BYPASS, true);

/** True once all three Cloudinary credentials are present. */
export const isUploadConfigured = Boolean(
  env.cloudinary.cloudName && env.cloudinary.apiKey && env.cloudinary.apiSecret
);

const REQUIRED = [
  ["MONGO_URI", env.mongoUri],
  ["JWT_ACCESS_SECRET", env.jwt.accessSecret],
  ["JWT_REFRESH_SECRET", env.jwt.refreshSecret],
];

export const validateEnv = () => {
  const missing = REQUIRED.filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Copy .env.example to .env and fill them in.`
    );
  }

  if (isProduction && env.jwt.accessSecret === env.jwt.refreshSecret) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ in production.");
  }
};
