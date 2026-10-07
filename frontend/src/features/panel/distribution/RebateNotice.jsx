/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useRef, useState } from "react";
import { markRebateSeen, unseenRebates } from "../../../api/hotel.api.js";
import { invalidateCache } from "../../../hooks/asyncCache.js";
import { connectSocket } from "../../../realtime/socket.js";
import { useAppStore } from "../../../store/useAppStore.js";
import CoinsReceived from "./CoinsReceived.jsx";

/**
 * Announces a month-end payout to the hotel's manager.
 *
 * Two ways in, deliberately: the live `rebate:credited` push for a manager
 * whose panel is open when the admin distributes, and the unseen list fetched
 * on sign-in for one who was not. Either way the announcement stays until the
 * manager collects it, which is what marks it seen server-side.
 *
 * HOTEL_ADMIN only, matching the API. Staff sit in the same hotel room and so
 * receive the push too, but inventory is the manager's business and the
 * unseen endpoint would 403 for them.
 *
 * Mounted by HotelPanelLayout. A realtime hook that nothing renders is a hook
 * that silently never runs — see the regression test in
 * tests/coinDistribution.test.js.
 */
const RebateNotice = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const hotelName = useAppStore((s) => s.staffHotel?.name);
  const enabled = isAuthenticated && role === "HOTEL_ADMIN";

  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  // Collected ids, so a resync racing the "seen" request cannot re-queue one.
  const collected = useRef(new Set());

  const add = useCallback((items) => {
    setQueue((q) => {
      const have = new Set(q.map((n) => n.id));
      const fresh = items.filter((n) => n?.id && !have.has(n.id) && !collected.current.has(n.id));
      return fresh.length ? [...q, ...fresh] : q;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const sync = () =>
      unseenRebates()
        .then((data) => !cancelled && add(data?.notices || []))
        .catch(() => {
          // An announcement is not worth a visible failure; the coins are in
          // the inventory either way.
        });

    sync();

    const socket = connectSocket();
    if (!socket) {
      return () => {
        cancelled = true;
      };
    }

    const onCredited = ({ notice } = {}) => {
      if (!notice) return;
      // Inventory and the monthly rebate figures just changed under any
      // screen that cached them.
      invalidateCache("hotel.dashboard");
      invalidateCache("hotel.coinBalance");
      add([notice]);
    };

    socket.on("rebate:credited", onCredited);
    socket.on("connect", sync);

    return () => {
      cancelled = true;
      socket.off("rebate:credited", onCredited);
      socket.off("connect", sync);
    };
  }, [enabled]);

  const current = queue[0];
  if (!enabled || !current) return null;

  const collect = async () => {
    setBusy(true);
    collected.current.add(current.id);
    try {
      await markRebateSeen(current.id);
    } catch {
      // Shown again on the next sign-in at worst — better than trapping the
      // manager behind a dialog that will not close.
    } finally {
      setBusy(false);
      setQueue((q) => q.filter((n) => n.id !== current.id));
    }
  };

  return (
    <CoinsReceived
      key={current.id}
      notice={current}
      hotelName={hotelName}
      busy={busy}
      position={queue.length > 1 ? `1 of ${queue.length} payouts` : null}
      onClose={collect}
    />
  );
};

export default RebateNotice;
