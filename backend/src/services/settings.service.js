import { PlatformSettings } from "../models/platformSettings.model.js";

const CACHE_TTL_MS = 60_000;

let cached = null;
let cachedAt = 0;

/** Invalidate after a settings write so the next read is fresh. */
export const invalidateSettingsCache = () => {
  cached = null;
  cachedAt = 0;
};

/**
 * Platform settings, memoised for a minute. The redeem path reads these on
 * every call, and they change roughly never.
 */
export const getSettings = async ({ fresh = false } = {}) => {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  let settings = await PlatformSettings.findOne({ key: "GLOBAL" });
  if (!settings) settings = await PlatformSettings.create({ key: "GLOBAL" });

  cached = settings;
  cachedAt = Date.now();
  return settings;
};

export const updateSettings = async (patch, userId) => {
  const settings = await PlatformSettings.findOneAndUpdate(
    { key: "GLOBAL" },
    { ...patch, updatedBy: userId },
    { new: true, upsert: true, runValidators: true }
  );
  invalidateSettingsCache();
  return settings;
};
