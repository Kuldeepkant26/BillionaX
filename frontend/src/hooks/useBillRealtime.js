/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore.js";
import { connectSocket, getSocket } from "../realtime/socket.js";
import { listBills } from "../api/guest.api.js";
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

    const onPaid = ({ billId }) => {
      removeBill(billId);
      settled();
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

    return () => {
      socket.off("connect", refresh);
      socket.off("bill:new", refresh);
      socket.off("bill:paid", onPaid);
      socket.off("bill:cancelled", onCancelled);
      socket.off("bill:expired", refresh);
    };
  }, [isAuthenticated, onChange]);
};

/** The live socket, for callers that need to check connectivity. */
export const useSocket = () => getSocket();
