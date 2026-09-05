/**
 * The inclusive end of a filter's "to" date.
 *
 * A date input sends "2026-09-05", which `new Date()` reads as MIDNIGHT that
 * morning. Used raw as an upper bound it excludes the entire day the user
 * picked — so a staff member filtering "today" sees nothing they did today,
 * and reports quietly lose their most recent day.
 *
 * A full timestamp is passed through untouched: only a date-only string is
 * ambiguous, and widening an explicit time would be wrong.
 */
export const endOfDay = (value) => {
  if (value instanceof Date) return value;

  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return date;

  // YYYY-MM-DD with nothing after it — the only case that needs widening.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  return date;
};
