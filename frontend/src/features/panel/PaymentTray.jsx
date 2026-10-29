import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cancelBill } from "../../api/hotel.api.js";
import { invalidateCache } from "../../hooks/asyncCache.js";
import { useAppStore } from "../../store/useAppStore.js";
import { formatPaise, timeAgo } from "../../utils/format.js";
import { ConfirmPaymentDialog } from "./ConfirmPaymentDialog.jsx";

/**
 * The signed-in staff member's own bills awaiting payment, on every page.
 *
 * Only their own, because only the person who sent a bill may confirm it — a
 * tray full of colleagues' bills with dead Confirm buttons would be noise.
 * Fed by useBillTray in HotelPanelLayout.
 *
 * A floating card rather than a page: the moment that matters is a guest
 * opening the UPI details while staff are on some other screen, so the tray
 * pops open by itself when that happens (and the hook chimes). It collapses to
 * a pill when staff want the screen back, and disappears when there is nothing
 * outstanding.
 *
 * Portalled to <body>, which carries the same data-theme attributes as the
 * panel's themed wrapper, so every token resolves.
 */
export const PaymentTray = () => {
  const bills = useAppStore((s) => s.trayBills);
  const dropTrayBill = useAppStore((s) => s.dropTrayBill);
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [voiding, setVoiding] = useState(null);

  const paying = bills.filter((b) => b.upiStartedAt);

  /*
   * Open on its own when a guest starts paying — counted by id rather than by
   * length, so one bill settling at the same moment another starts still
   * counts as news.
   */
  const seen = useRef(new Set());
  useEffect(() => {
    const fresh = paying.some((b) => !seen.current.has(b.id));
    seen.current = new Set(paying.map((b) => b.id));
    if (fresh) setOpen(true);
  }, [paying.map((b) => b.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!bills.length) return null;

  const voidBill = async (bill) => {
    if (voiding) return;
    setVoiding(bill.id);
    try {
      await cancelBill(bill.id);
      dropTrayBill(bill.id);
      invalidateCache("hotel.bill");
      toastSuccess("Bill cancelled");
    } catch (err) {
      toastError(err.message || "Could not cancel that bill");
    } finally {
      setVoiding(null);
    }
  };

  const tray = !open ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="fixed z-[90] right-4 bottom-4 flex items-center gap-2 py-2.5 px-4 rounded-full border border-hairline bg-card text-ink text-[12.5px] font-semibold shadow-lg cursor-pointer"
    >
      <span className="relative flex w-2.5 h-2.5" aria-hidden="true">
        {paying.length > 0 && (
          <span className="absolute inline-flex w-full h-full rounded-full bg-accent opacity-60 animate-ping" />
        )}
        <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${paying.length ? "bg-accent" : "bg-muted"}`} />
      </span>
      {paying.length
        ? `${paying.length} guest${paying.length === 1 ? " is" : "s are"} paying`
        : `${bills.length} bill${bills.length === 1 ? "" : "s"} awaiting payment`}
    </button>
  ) : (
    <section
      aria-label="Your bills awaiting payment"
      className="fixed z-[90] right-4 bottom-4 w-[min(360px,calc(100vw-32px))] max-h-[min(70vh,560px)] flex flex-col rounded-token border border-hairline bg-card text-ink shadow-xl"
    >
      <header className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3 border-b border-hairline">
        <div>
          <h2 className="m-0 font-display text-[14px] font-semibold">Awaiting payment</h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-muted">
            Bills you sent. Confirm once the money shows in your UPI app.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn-ghost btn-sm flex-none"
          aria-label="Minimise"
        >
          –
        </button>
      </header>

      <ul className="m-0 p-0 list-none overflow-y-auto">
        {bills.map((bill) => (
          <li key={bill.id} className="px-4 py-3 border-b border-hairline last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <b className="text-[13px] font-semibold truncate">{bill.guestName}</b>
              <b className="tnum text-[14px] font-semibold">{formatPaise(bill.payablePaise)}</b>
            </div>

            <p className="m-0 mt-0.5 text-[11.5px] text-muted tnum">
              {[bill.payRef, bill.payTo?.label, timeAgo(bill.createdAt)].filter(Boolean).join(" · ")}
            </p>

            <p className={`m-0 mt-1.5 text-[11.5px] font-semibold ${bill.upiStartedAt ? "text-accent" : "text-muted"}`}>
              {bill.upiStartedAt
                ? `Guest opened payment ${timeAgo(bill.upiStartedAt)} — check for ${bill.payRef || "this amount"}`
                : "Waiting for the guest to pay"}
            </p>

            <div className="flex gap-2 mt-2.5">
              {/* Filled only once the guest has opened the payment: before
                  that there is usually nothing to confirm, and a loud button
                  invites settling a bill nobody has paid. */}
              <button
                type="button"
                className={`btn btn-sm${bill.upiStartedAt ? "" : " btn-ghost"}`}
                onClick={() => setConfirming(bill)}
              >
                Confirm received
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => voidBill(bill)}
                disabled={voiding === bill.id}
              >
                {voiding === bill.id ? "…" : "Cancel bill"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      {createPortal(tray, document.body)}
      <ConfirmPaymentDialog
        bill={confirming}
        onClose={() => setConfirming(null)}
        onConfirmed={dropTrayBill}
      />
    </>
  );
};
