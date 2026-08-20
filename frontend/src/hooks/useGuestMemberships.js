/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { listMemberships } from "../api/guest.api.js";
import { useAppStore } from "../store/useAppStore.js";

/**
 * Loads the signed-in guest's memberships into the store, once per mount of
 * the guest shell.
 *
 * Memberships are deliberately not persisted (balances go stale immediately),
 * but they are read by Home, Redeem, History, Alerts and You. Fetching here
 * rather than per page means landing on any tab directly — deep link, reload,
 * or a tap in the bottom nav — shows real data instead of zeros.
 */
export const useGuestMemberships = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const setMemberships = useAppStore((s) => s.setMemberships);
  const setTierThresholds = useAppStore((s) => s.setTierThresholds);

  useEffect(() => {
    if (!isAuthenticated || role !== "GUEST") return;

    let cancelled = false;
    listMemberships()
      .then((data) => {
        if (cancelled || !data) return;
        if (data.memberships) setMemberships(data.memberships);
        if (data.tierThresholds) setTierThresholds(data.tierThresholds);
      })
      .catch(() => {
        // Each page still renders from whatever the store already holds.
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, role]);
};
