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
    /**
     * Which identifier a guest signs in with: "email" or "phone". The SMS path
     * is kept intact behind this switch, so returning to it is an env change
     * rather than a code change.
     */
    channel: process.env.OTP_CHANNEL || "email",
    provider: process.env.OTP_PROVIDER || "console",
    expiresMinutes: toInt(process.env.OTP_EXPIRES_MINUTES, 5),
    maxAttempts: toInt(process.env.OTP_MAX_ATTEMPTS, 5),
    length: toInt(process.env.OTP_LENGTH, 4),

    /**
     * Guest numbers are stored as bare 10-digit locals (see normalizePhone),
     * but every SMS gateway wants full international format. This is the code
     * prepended at send time — configurable so the platform is not welded to
     * one country.
     */
    countryCode: (process.env.OTP_COUNTRY_CODE || "91").replace(/\D/g, ""),
  },

  /**
   * Transactional email (Brevo). Carries the guest login code, so in
   * production it is required whenever the email channel is selected —
   * see validateEnv.
   */
  email: {
    apiKey: process.env.BREVO_API_KEY,
    baseUrl: process.env.BREVO_BASE_URL || "https://api.brevo.com/v3",
    fromAddress: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME || "BillionaX",
    timeoutMs: toInt(process.env.EMAIL_TIMEOUT_MS, 10_000),
  },

  /**
   * SMS gateway (smsmode). Like Cloudinary, deliberately NOT in REQUIRED:
   * without a key the OTP provider falls back to logging the code, so the
   * server still boots and development still works.
   *
   * The API key can send messages at your expense — server-side only.
   */
  smsmode: {
    apiKey: process.env.SMSMODE_API_KEY,
    baseUrl: process.env.SMSMODE_BASE_URL || "https://rest.smsmode.com/sms/v1",
    // Optional: only valid if registered under Settings -> Senders IDs on the
    // smsmode account. Left unset, smsmode picks a default sender.
    sender: process.env.SMSMODE_SENDER || undefined,
    timeoutMs: toInt(process.env.SMSMODE_TIMEOUT_MS, 10_000),
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

/** Brevo needs both a key and a verified sender address to send anything. */
export const isEmailConfigured = Boolean(env.email.apiKey && env.email.fromAddress);

/** True once the SMS gateway has a key to authenticate with. */
export const isSmsConfigured = Boolean(env.smsmode.apiKey);

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

  if (!["email", "phone"].includes(env.otp.channel)) {
    throw new Error(`OTP_CHANNEL must be "email" or "phone", got "${env.otp.channel}".`);
  }

  /**
   * In production the dev bypass is already forced off, so guests can only sign
   * in with a code that actually reached them. A misconfigured channel there
   * means nobody can log in at all — fail loudly at boot rather than at the
   * first login attempt.
   */
  if (isProduction) {
    if (env.otp.channel === "email" && !isEmailConfigured) {
      throw new Error(
        "OTP_CHANNEL=email requires BREVO_API_KEY and EMAIL_FROM to be set."
      );
    }

    if (env.otp.channel === "phone") {
      if (env.otp.provider === "console") {
        throw new Error(
          "OTP_PROVIDER=console only logs codes and cannot sign anyone in. " +
            "Set OTP_PROVIDER=smsmode and SMSMODE_API_KEY for production."
        );
      }
      if (env.otp.provider === "smsmode" && !isSmsConfigured) {
        throw new Error("OTP_PROVIDER=smsmode requires SMSMODE_API_KEY to be set.");
      }
    }
  }
};
