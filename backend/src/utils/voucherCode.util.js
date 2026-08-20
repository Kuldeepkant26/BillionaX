import crypto from "node:crypto";

// Ambiguous glyphs (O/0, I/1) removed — codes get read aloud and typed by staff.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const randomBlock = (length) =>
  Array.from({ length }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]).join("");

/**
 * Builds a voucher code like "GW-8KQ2-XP91".
 * crypto.randomInt, never Math.random() — a guessable code is free money.
 */
export const generateVoucherCode = () => `GW-${randomBlock(4)}-${randomBlock(4)}`;

/** Normalises whatever staff typed (spaces, lowercase, missing dashes tolerated). */
export const normalizeVoucherCode = (input = "") => input.trim().toUpperCase().replace(/\s+/g, "");
