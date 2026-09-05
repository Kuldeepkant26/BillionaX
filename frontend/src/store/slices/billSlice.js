/**
 * Live bills.
 *
 * Deliberately NOT persisted (it is absent from partialize in useAppStore): a
 * bill restored from localStorage could be minutes stale — already paid,
 * cancelled or expired — and the first thing the guest would see on opening the
 * app is a charge that no longer exists. The server is re-read on every mount
 * and every reconnect instead, which is the same self-healing approach the
 * notification badge takes.
 */
export const createBillSlice = (set, get) => ({
  /** Every PENDING bill for this guest, newest first. */
  pendingBills: [],

  /**
   * The bill the popup is showing, or null.
   *
   * Separate from pendingBills because dismissing the popup must not discard
   * the bill — "Not now" closes this and leaves the bill on the Pay screen.
   */
  popupBill: null,

  /**
   * Replaces the list from a server read — on mount, on reconnect, on tab focus.
   *
   * Also opens the popup when one is not already up. Without that, a bill sent
   * while the app was closed or the socket was down would sit silently in the
   * list: the guest would have to think to visit the Pay screen, which is
   * precisely what the popup exists to make unnecessary. The socket push is an
   * optimisation, so this path has to be able to surface a bill on its own.
   *
   * A popup that is already open is never replaced — the guest may be partway
   * through reading or paying it.
   */
  setPendingBills: (pendingBills) => {
    const { popupBill } = get();

    // Keep showing the current one, unless it has just been settled elsewhere.
    const stillOpen = popupBill && pendingBills.some((b) => b.id === popupBill.id);

    set({
      pendingBills,
      popupBill: stillOpen ? popupBill : pendingBills[0] || null,
    });
  },

  /**
   * A bill arrived over the socket.
   *
   * Queued rather than shown immediately when a popup is already up: two bills
   * landing together must not replace one another mid-read, and a guest partway
   * through paying should not have the amount swapped underneath them.
   */
  receiveBill: (bill) => {
    const { pendingBills, popupBill } = get();
    if (pendingBills.some((b) => b.id === bill.id)) return;

    set({
      pendingBills: [bill, ...pendingBills],
      popupBill: popupBill || bill,
    });
  },

  /** Closes the popup without touching the bill itself. */
  dismissPopup: () => {
    const { pendingBills, popupBill } = get();
    // Show the next one waiting, if any — otherwise a queued bill would only
    // surface on the next navigation.
    const next = pendingBills.find((b) => b.id !== popupBill?.id) || null;
    set({ popupBill: next });
  },

  /** A bill reached a terminal state: drop it, and clear the popup if it was showing. */
  removeBill: (billId) => {
    const { pendingBills, popupBill } = get();
    const remaining = pendingBills.filter((b) => b.id !== billId);

    set({
      pendingBills: remaining,
      popupBill: popupBill?.id === billId ? remaining[0] || null : popupBill,
    });
  },

  clearBills: () => set({ pendingBills: [], popupBill: null }),
});
