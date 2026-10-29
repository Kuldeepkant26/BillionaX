import { useCallback, useState } from "react";
import { cancelBill, confirmBill, payBill } from "../api/guest.api.js";
import { useAppStore } from "../store/useAppStore.js";
import { invalidateCache } from "./asyncCache.js";

/**
 * Paying or declining one bill.
 *
 * Shared by the Pay screen and the popup so the two cannot drift: the sequence
 * has to be identical wherever the guest happens to be standing when the bill
 * arrives.
 *
 * DIRECT UPI. `start` holds the coins the guest chose and returns the hotel's
 * UPI details; the guest then pays from their own UPI app, and the bill
 * settles when the staff member who sent it confirms the money arrived. There
 * is deliberately no "I've paid" call here — the guest cannot settle a bill
 * that has money on it, and the sheet simply waits for the hotel's bill:paid.
 *
 * The one exception is a bill coins cover entirely: nothing for the desk to
 * receive, so the guest settles it straight away.
 */
export const useBillPayment = ({ onSettled } = {}) => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const removeBill = useAppStore((s) => s.removeBill);
  const updateBill = useAppStore((s) => s.updateBill);

  const [busy, setBusy] = useState(false);
  // The open payment: what the UPI sheet is showing. { billId, bill, upi }
  const [payment, setPayment] = useState(null);

  /**
   * Holds the coins and opens the UPI details. Called again to reopen them or
   * to change the coins — the server adjusts the hold rather than adding to it.
   */
  const start = useCallback(
    async (bill, coins) => {
      if (busy) return;
      setBusy(true);

      try {
        const res = await payBill(bill.id, coins || 0);
        // The server has now fixed the coins and the amount; the card shows
        // "payment in progress" from this copy.
        updateBill(res.bill);

        if (res.settlesWithoutPayment) {
          await confirmBill(bill.id);
          removeBill(bill.id);
          toastSuccess("Paid with coins");
          // The payment moved the guest's coin balance and added a
          // transaction, so every cached guest screen showing either is now
          // wrong.
          invalidateCache("guest.memberships");
          invalidateCache("guest.transactions");
          onSettled?.(bill.id);
          return;
        }

        setPayment({ billId: bill.id, bill: res.bill, upi: res.upi });
      } catch (err) {
        toastError(err.message || "Could not open that payment");
      } finally {
        setBusy(false);
      }
    },
    [busy, onSettled, removeBill, toastError, toastSuccess, updateBill]
  );

  /**
   * The sheet saw the hotel confirm. The bill itself was already dropped by
   * useBillRealtime on the same bill:paid; this tidies up after the tick.
   */
  const settled = useCallback(() => {
    const billId = payment?.billId;
    setPayment(null);
    invalidateCache("guest.memberships");
    invalidateCache("guest.transactions");
    if (billId) onSettled?.(billId);
  }, [payment, onSettled]);

  /** Closes the sheet. The bill stays pending, with its coins still held. */
  const close = useCallback(() => setPayment(null), []);

  /** Declines the bill outright. Staff are told immediately, and any held coins come back. */
  const decline = useCallback(
    async (bill) => {
      setBusy(true);
      try {
        await cancelBill(bill.id);
        removeBill(bill.id);
        // A cancelled bill is now part of the guest's history, so the cached
        // History tab would otherwise not show it until the entry aged out.
        invalidateCache("guest.transactions");
        onSettled?.(bill.id);
      } catch (err) {
        toastError(err.message || "Could not cancel that bill");
      } finally {
        setBusy(false);
      }
    },
    [onSettled, removeBill, toastError]
  );

  return { busy, payment, start, settled, close, decline };
};
