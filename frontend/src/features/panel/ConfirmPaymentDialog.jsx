import { useState } from "react";
import { confirmBill } from "../../api/hotel.api.js";
import { invalidateCache } from "../../hooks/asyncCache.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Button, Modal } from "../../components/common/index.jsx";
import { formatCoins, formatPaise } from "../../utils/format.js";

/**
 * "Did the money arrive?" — the one irreversible step in a UPI bill.
 *
 * A dialog, unlike voiding a bill (which has none): confirming settles the
 * bill, spends the guest's held coins and issues their invoice, and none of
 * that can be taken back. The dialog says exactly what to look for in the UPI
 * app — amount, reference, account — because "I think I saw a payment" is how
 * two guests paying the same amount get mixed up.
 *
 * The amount shown is sent with the request. If the guest changed their coins
 * in the meantime the server refuses with the new figure instead of settling
 * at an amount nobody here checked.
 */
export const ConfirmPaymentDialog = ({ bill, onClose, onConfirmed }) => {
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const [busy, setBusy] = useState(false);

  if (!bill) return null;

  const amount = formatPaise(bill.payablePaise);
  const account = bill.payTo
    ? `${bill.payTo.label ? `${bill.payTo.label} · ` : ""}${bill.payTo.vpa}`
    : null;

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmBill(bill.id, bill.payablePaise);
      toastSuccess(`${amount} received — bill settled`);
      // A settled bill has a new detail and a new history row.
      invalidateCache("hotel.bill");
      invalidateCache("hotel.dashboard");
      onConfirmed?.(bill.id);
      onClose();
    } catch (err) {
      toastError(err.message || "Could not confirm that payment");
      // A 409 means the amount moved; the list refreshes from the socket push
      // that came with the change, so close and let staff look again.
      if (err.status === 409) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Confirm payment received?"
      onClose={busy ? undefined : onClose}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Not yet
          </Button>
          <Button onClick={confirm} disabled={busy}>
            {busy ? "Confirming…" : `Yes, I received ${amount}`}
          </Button>
        </div>
      }
    >
      <p className="text-[13px] leading-relaxed">
        Check your UPI app for a payment of <b>{amount}</b> from <b>{bill.guestName || "the guest"}</b>
        {bill.payRef && (
          <>
            {" "}
            with the note <b className="tnum">{bill.payRef}</b>
          </>
        )}
        {account && (
          <>
            , paid to <b>{account}</b>
          </>
        )}
        .
      </p>
      {!bill.upiStartedAt && (
        <p className="notice-warn mt-3 text-[12px]">
          This guest hasn&rsquo;t opened the payment details yet. Only confirm if you have the money
          — for example, they paid at the desk.
        </p>
      )}
      <p className="hint">
        Confirming settles the bill
        {bill.coinsApplied > 0 ? `, uses ${formatCoins(bill.coinsApplied)} of their coins` : ""} and
        sends their invoice. It can&rsquo;t be undone.
      </p>
    </Modal>
  );
};
