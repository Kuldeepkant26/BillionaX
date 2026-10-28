/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { newEnquiryCount } from "../api/admin.api.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Counts the partnership enquiries nobody has picked up, for the admin nav.
 *
 * Asked on mount and whenever the tab becomes visible again, like the
 * distribution badge: a lead arriving overnight shows up when the admin comes
 * back to the panel. No socket — enquiries trickle in, and the Enquiries page
 * re-asks after every status change it makes.
 */
export const useEnquiryBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setEnquiriesNew = useAppStore((s) => s.setEnquiriesNew);

  const enabled = isAuthenticated && role === "MAIN_ADMIN";

  useEffect(() => {
    if (!enabled) return undefined;

    const sync = () =>
      newEnquiryCount()
        .then((data) => setEnquiriesNew(data?.count))
        .catch(() => {
          // A badge is not worth a visible failure.
        });

    const onVisible = () => document.visibilityState === "visible" && sync();

    sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
};
