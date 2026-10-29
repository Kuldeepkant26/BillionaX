/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore.js";
import { connectSocket, getSocket } from "../realtime/socket.js";
import { listBills } from "../api/guest.api.js";
import { listBills as listHotelBills } from "../api/hotel.api.js";
import { chime } from "../utils/chime.js";
import { formatPaise } from "../utils/format.js";
import { invalidateCache } from "./asyncCache.js";

/**
 * Keeps a guest's bills live.
 *
 * Server-push is an optimisation here, not the source of truth. A socket
 * dropped while the phone was locked loses whatever was emitted in the
 * meantime, so every connect and every return to the tab re-reads the pending
 * bills from the server. That makes a missed push heal itself and removes the
 * need for a delivery queue — the same reasoning the unread badge follows.
 *
 * A missed bill matters more than a missed notification: the guest is standing
 * at a desk waiting to pay.
 */
export const useBillRealtime = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const setPendingBills = useAppStore((s) => s.setPendingBills);
  const receiveBill = useAppStore((s) => s.receiveBill);
  const removeBill = useAppStore((s) => s.removeBill);
  const toast = useAppStore((s) => s.toast);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const socket = connectSocket();
    if (!socket) return undefined;

    const resync = () =>
      listBills({ status: "PENDING" })
        .then((res) => setPendingBills(res.items || []))
        .catch(() => {
          // A failed resync leaves the last known list in place, which is
          // better than blanking the screen on a flaky connection.
        });

    resync();

    const onNew = ({ bill }) => bill && receiveBill(bill);

    /*
     * Each of these ends a bill's life, which makes it history — and the
     * History tab is cached, so without dropping that entry the guest would
     * navigate there and not find the bill that just settled.
     *
     * These fire for changes made ELSEWHERE too: the desk voiding a bill
     * reaches this guest only as a socket event, so this is the only place
     * that case can invalidate anything.
     */
    const settled = () => invalidateCache("guest.transactions");

    const onPaid = ({ billId, byHotel }) => {
      removeBill(billId);
      settled();
      // The hotel confirming a UPI payment can land long after the guest
      // closed the payment sheet, so the toast is what tells them. Their own
      // coins-only settlement echoes here too, without the flag.
      if (byHotel) toast("Payment confirmed by the hotel", "success");
    };

    const onCancelled = ({ billId, byStaff }) => {
      removeBill(billId);
      settled();
      // Only when the DESK voided it. The guest's own decline echoes back here
      // too, and toasting that would announce an action they just took.
      if (byStaff) toast("The hotel cancelled your bill");
    };

    const onExpired = ({ billId }) => {
      removeBill(billId);
      settled();
      toast("A bill expired before it was paid");
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") resync();
    };

    socket.on("connect", resync);
    socket.on("bill:created", onNew);
    socket.on("bill:paid", onPaid);
    socket.on("bill:cancelled", onCancelled);
    socket.on("bill:expired", onExpired);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      socket.off("connect", resync);
      socket.off("bill:created", onNew);
      socket.off("bill:paid", onPaid);
      socket.off("bill:cancelled", onCancelled);
      socket.off("bill:expired", onExpired);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated]);
};

/**
 * The staff side: keeps the panel's bill list current.
 *
 * The server already joins staff sockets to their hotel's room, so this only
 * had to subscribe — but nothing in the panel opened a socket at all before
 * now, so the connection itself is new here.
 */
export const useHotelBillRealtime = (onChange) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const toast = useAppStore((s) => s.toast);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const socket = connectSocket();
    if (!socket) return undefined;

    const refresh = () => onChange?.();

    const onPaid = ({ guestId }) => {
      // Staff are usually looking at the guest, not the screen — a toast is
      // what actually gets noticed.
      toast("Bill paid", "success");
      onChange?.(guestId);
    };

    const onCancelled = () => {
      toast("A guest cancelled their bill");
      onChange?.();
    };

    socket.on("connect", refresh);
    socket.on("bill:new", refresh);
    socket.on("bill:paid", onPaid);
    socket.on("bill:cancelled", onCancelled);
    socket.on("bill:expired", refresh);
    // A guest opened the UPI details: the row gains its "paying now" state and
    // the amount after coins. The chime is the tray's job, not this list's.
    socket.on("bill:payment-started", refresh);

    return () => {
      socket.off("connect", refresh);
      socket.off("bill:new", refresh);
      socket.off("bill:paid", onPaid);
      socket.off("bill:cancelled", onCancelled);
      socket.off("bill:expired", refresh);
      socket.off("bill:payment-started", refresh);
    };
  }, [isAuthenticated, onChange]);
};

/**
 * Calls `onSettled` whenever a bill at this hotel reaches history — paid,
 * cancelled or expired — and on reconnect, to catch any missed while offline.
 *
 * Silent on purpose. useHotelBillRealtime already toasts these events for the
 * page; a second subscriber that toasted too would announce every payment
 * twice. This one only refreshes.
 *
 * Coalesced: the expiry sweep flips every lapsed bill in the same second and
 * emits once per bill, and ten refetches of the same page in a row would be
 * nine too many.
 */
export const useHotelBillSettled = (onSettled) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const socket = connectSocket();
    if (!socket) return undefined;

    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => onSettled?.(), 250);
    };

    socket.on("connect", refresh);
    socket.on("bill:paid", refresh);
    socket.on("bill:cancelled", refresh);
    socket.on("bill:expired", refresh);

    return () => {
      clearTimeout(timer);
      socket.off("connect", refresh);
      socket.off("bill:paid", refresh);
      socket.off("bill:cancelled", refresh);
      socket.off("bill:expired", refresh);
    };
  }, [isAuthenticated, onSettled]);
};

/**
 * Feeds the confirm tray: this staff member's OWN pending bills, kept live.
 *
 * Mounted once in HotelPanelLayout so the tray and its nav badge work on every
 * page — a guest pays while staff are on Members as often as on the Bill page.
 *
 * The same self-healing shape as useBillRealtime: the server list is re-read
 * on mount, on reconnect, on tab focus and on every bill event, so a push
 * missed while the laptop slept costs nothing. Only bill:payment-started for
 * one of THIS user's bills chimes — a colleague's guest paying is not theirs
 * to confirm.
 */
export const useBillTray = () => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const role = useAppStore((s) => s.user?.role);
  const myId = useAppStore((s) => s.user?.id);
  const setTrayBills = useAppStore((s) => s.setTrayBills);
  const toast = useAppStore((s) => s.toast);

  const enabled = isAuthenticated && (role === "HOTEL_ADMIN" || role === "HOTEL_STAFF");

  useEffect(() => {
    if (!enabled) return undefined;

    let live = true;
    // A ticket per request, so a slow response cannot overwrite a newer one.
    let seq = 0;

    const refresh = () => {
      const ticket = ++seq;
      listHotelBills({ status: "PENDING", mine: true, limit: 20 })
        .then((res) => live && ticket === seq && setTrayBills(res.items || []))
        .catch(() => {
          // The last known list stays; the next event or focus retries.
        });
    };

    refresh();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    const socket = connectSocket();
    if (!socket) {
      return () => {
        live = false;
        document.removeEventListener("visibilitychange", onVisible);
      };
    }

    const onStarted = (payload) => {
      if (myId && String(payload?.staffId) === String(myId)) {
        chime();
        toast(
          `Guest is paying ${formatPaise(payload.payablePaise)}${
            payload.payRef ? ` · ${payload.payRef}` : ""
          } — check your UPI app`,
          "info"
        );
      }
      refresh();
    };

    socket.on("connect", refresh);
    socket.on("bill:new", refresh);
    socket.on("bill:paid", refresh);
    socket.on("bill:cancelled", refresh);
    socket.on("bill:expired", refresh);
    socket.on("bill:payment-started", onStarted);

    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
      socket.off("connect", refresh);
      socket.off("bill:new", refresh);
      socket.off("bill:paid", refresh);
      socket.off("bill:cancelled", refresh);
      socket.off("bill:expired", refresh);
      socket.off("bill:payment-started", onStarted);
    };
  }, [enabled, myId]);
};

/** The live socket, for callers that need to check connectivity. */
export const useSocket = () => getSocket();
