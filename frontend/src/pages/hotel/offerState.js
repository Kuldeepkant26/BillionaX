import { formatDate } from "../../utils/format.js";

/**
 * What state an offer is in, derived from its dates.
 *
 * Derived rather than stored: a status column would need updating by something
 * on a timer and could disagree with the dates that actually drive both the
 * guest query and the deletion sweep. One reading of `validFrom`/`validTo` is
 * the whole truth.
 *
 * Kept in step with OFFER_GRACE_DAYS in the backend's constants.js — the panel
 * promises "deletes in N days" and the sweep has to honour it.
 */
export const OFFER_GRACE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export const offerState = (item, now = Date.now()) => {
  const from = item?.validFrom ? new Date(item.validFrom).getTime() : null;
  const to = item?.validTo ? new Date(item.validTo).getTime() : null;

  if (to && to < now) {
    // How long the manager still has to review or duplicate it.
    const daysLeft = Math.max(0, OFFER_GRACE_DAYS - Math.floor((now - to) / DAY_MS));
    return {
      state: "expired",
      label: "Expired",
      tone: "bad",
      note: daysLeft === 0 ? "Deletes today" : `Deletes in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
    };
  }

  if (from && from > now) {
    return {
      state: "scheduled",
      label: "Scheduled",
      tone: undefined,
      note: `Starts ${formatDate(item.validFrom)}`,
    };
  }

  // Falls through to the plain published/hidden reading every kind shares.
  return {
    state: item?.isActive ? "live" : "hidden",
    label: item?.isActive ? "Live" : "Hidden",
    tone: item?.isActive ? "ok" : undefined,
    note: to ? `Ends ${formatDate(item.validTo)}` : null,
  };
};
