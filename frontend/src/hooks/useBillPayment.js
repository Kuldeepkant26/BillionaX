import { useCallback, useState } from "react";
import { cancelBill, confirmBill, payBill } from "../api/guest.api.js";
import { useAppStore } from "../store/useAppStore.js";
import { invalidateCache } from "./asyncCache.js";

/**
 * Paying or declining one bill.
 *
 * Shared by the Pay screen and the popup so the two cannot drift: the sequence
 * — open an order, run checkout, confirm — has to be identical wherever the
 * guest happens to be standing when the bill arrives.
 *
 * The provider is invisible from here. In demo mode `startBillPayment` returns
 * a demo order and the sheet simulates authorisation; with real credentials the
 * same call returns a live order. This hook does not branch on which, which is
 * what keeps a demo indistinguishable from the real thing.
 */
export const useBillPayment = ({ onSettled } = {}) => {
  const toastError = useAppStore((s) => s.toastError);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const removeBill = useAppStore((s) => s.removeBill);

  const [busy, setBusy] = useState(false);
  // The open order: what the checkout sheet is showing, and what confirm needs.
  const [checkout, setCheckout] = useState(null);

  /** Prices the coins and opens an order. */
  const start = useCallback(
    async (bill, coins) => {
      if (busy) return;
      setBusy(true);

      try {
        const res = await payBill(bill.id, coins || 0);

        // A bill covered entirely by coins has nothing to charge, so it settles
        // without a checkout at all.
        if (res.settlesWithoutPayment) {
          await confirmBill(bill.id, {});
          removeBill(bill.id);
          toastSuccess("Paid with coins");
          onSettled?.(bill.id);
          return;
        }

        setCheckout({ billId: bill.id, order: res.order, payablePaise: res.bill.payablePaise });
      } catch (err) {
        toastError(err.message || "Could not start that payment");
      } finally {
        setBusy(false);
      }
    },
    [busy, onSettled, removeBill, toastError, toastSuccess]
  );

  /**
   * Called once the gateway reports success.
   *
   * A failure here leaves the bill PENDING on purpose — the guest can simply
   * try again rather than needing staff to reissue it.
   */
  const finish = useCallback(async () => {
    if (!checkout) return;
    setBusy(true);

    try {
      await confirmBill(checkout.billId, {
        providerPaymentId: checkout.order?.providerPaymentId || `${checkout.order?.providerOrderId}_pay`,
        signature: checkout.order?.signature || "demo",
      });

      removeBill(checkout.billId);
      setCheckout(null);
      toastSuccess("Payment complete");
      // The payment moved the guest's coin balance and added a transaction,
      // so every cached guest screen showing either is now wrong. Dropping
      // them means Home and History refetch on the next visit instead of
      // showing the pre-payment balance.
      invalidateCache("guest.memberships");
      invalidateCache("guest.transactions");
      onSettled?.(checkout.billId);
    } catch (err) {
      setCheckout(null);
      toastError(err.message || "That payment could not be confirmed");
    } finally {
      setBusy(false);
    }
  }, [checkout, onSettled, removeBill, toastError, toastSuccess]);

  const abandon = useCallback(() => setCheckout(null), []);

  /** Declines the bill outright. Staff are told immediately. */
  const decline = useCallback(
    async (bill) => {
      setBusy(true);
      try {
        await cancelBill(bill.id);
        removeBill(bill.id);
        onSettled?.(bill.id);
      } catch (err) {
        toastError(err.message || "Could not cancel that bill");
      } finally {
        setBusy(false);
      }
    },
    [onSettled, removeBill, toastError]
  );

  return { busy, checkout, start, finish, abandon, decline };
};
