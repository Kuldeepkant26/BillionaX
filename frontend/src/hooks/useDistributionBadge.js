/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { distributionPending } from "../api/admin.api.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Lights the Coin distribution nav item while last month waits to be paid out.
 *
 * Asked on mount and whenever the tab becomes visible again — that is what
 * makes the badge appear on the 1st for an admin who left the panel open
 * overnight. No socket: the answer only changes when a month ends or a
 * distribution runs, and the page itself clears it after a run.
 */
export const useDistributionBadge = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setDistributionPending = useAppStore((s) => s.setDistributionPending);

  const enabled = isAuthenticated && role === "MAIN_ADMIN";

  useEffect(() => {
    if (!enabled) return undefined;

    const sync = () =>
      distributionPending()
        .then((data) => setDistributionPending(data?.pending ? 1 : 0))
        .catch(() => {
          // A badge is not worth a visible failure.
        });

    const onVisible = () => document.visibilityState === "visible" && sync();

    sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled]);
};
