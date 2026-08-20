/**
 * Safe handling of user-supplied search strings used in $regex queries.
 *
 * Without escaping, `q` flows straight into { $regex: q }, which is two bugs at
 * once: a metacharacter injection (searching "." matches every row) and a ReDoS
 * vector (a crafted "(a+)+$" pins a CPU core on the cluster).
 */

/** Escapes every regex metacharacter so the value matches literally. */
export const escapeRegex = (value) =>
  String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a bounded, escaped, case-insensitive "contains" matcher.
 * Returns null for empty input so callers can skip the clause entirely.
 */
export const searchRegex = (value, { max = 64 } = {}) => {
  const trimmed = String(value ?? "").trim().slice(0, max);
  if (!trimmed) return null;
  return { $regex: escapeRegex(trimmed), $options: "i" };
};
