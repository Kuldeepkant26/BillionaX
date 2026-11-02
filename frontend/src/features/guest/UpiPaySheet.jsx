import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getBill } from "../../api/guest.api.js";
import { connectSocket } from "../../realtime/socket.js";
import { useAppStore } from "../../store/useAppStore.js";
import { formatPaise } from "../../utils/format.js";
import { UPI_APPS, mobilePlatform, upiAppLink } from "../../utils/upiApps.js";
import { QrCode } from "../panel/QrCode.jsx";
import styles from "./UpiPaySheet.module.css";

/**
 * Where and how much to pay — the hotel's UPI account, this bill's amount,
 * and the reference that ties the two together.
 *
 * The guest is almost always on the SAME phone that would have to scan a QR,
 * so the lead action on a phone is a row of app buttons — Google Pay, PhonePe,
 * Paytm — each opening THAT app with the payee, amount and note filled in.
 * utils/upiApps.js explains why one plain upi:// link was not enough: it
 * opened WhatsApp. "Other UPI app" keeps that plain link for BHIM and bank
 * apps. The QR is for a second device, or to save and scan from the gallery,
 * which every Indian UPI app supports.
 *
 * There is no "I've paid" button. Only the hotel can see the money arrive, so
 * the sheet waits for the staff member's confirmation (bill:paid) and turns
 * into a tick when it lands.
 */

const CopyRow = ({ label, value, copyValue, hint, onCopy }) => (
  <div className="flex items-center justify-between gap-3 py-2.5 border-t border-hairline first:border-t-0">
    <span className="min-w-0 flex flex-col leading-[1.35]">
      <span className="text-[11px] text-muted">{label}</span>
      <b className="text-[13.5px] font-semibold break-all tabular-nums">{value}</b>
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </span>
    <button
      type="button"
      className="btn btn-ghost btn-sm flex-none"
      onClick={() => onCopy(copyValue ?? value, label)}
    >
      Copy
    </button>
  </div>
);

const Sheet = ({ payment, hotelName, onSettled, onClose }) => {
  const toastSuccess = useAppStore((s) => s.toastSuccess);
  const toastError = useAppStore((s) => s.toastError);
  const stillPending = useAppStore((s) => s.pendingBills.some((b) => b.id === payment.billId));

  const [stage, setStage] = useState("waiting");
  // Set synchronously by the socket handler, so the "bill vanished" check
  // below can never mistake a confirmation for a cancellation.
  const paidRef = useRef(false);

  const { upi } = payment;
  // Null on a laptop, where a UPI link opens nothing, so no app buttons show.
  const platform = mobilePlatform();
  const payee = upi.payeeName || hotelName;
  const appLinks =
    platform && upi.amountLocked
      ? UPI_APPS.map((app) => ({ app, href: upiAppLink(app, upi.link, platform) })).filter(
          (x) => x.href
        )
      : [];

  // The hotel confirmed: show the tick, then let the caller tidy up.
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return undefined;

    const onPaid = ({ billId }) => {
      if (billId !== payment.billId) return;
      paidRef.current = true;
      setStage("done");
    };

    socket.on("bill:paid", onPaid);
    return () => socket.off("bill:paid", onPaid);
  }, [payment.billId]);

  useEffect(() => {
    if (stage !== "done") return undefined;
    const t = setTimeout(() => onSettled?.(), 1400);
    return () => clearTimeout(t);
  }, [stage, onSettled]);

  /**
   * The bill left the pending list without a bill:paid reaching this sheet —
   * the desk voided it, it expired, or it was confirmed while the socket was
   * down and a resync dropped it. Ask the server which, rather than guessing:
   * closing silently on a confirmed payment would leave the guest unsure
   * whether they had paid.
   */
  useEffect(() => {
    if (stillPending || paidRef.current) return undefined;
    let live = true;

    getBill(payment.billId)
      .then((res) => {
        if (!live) return;
        if (res?.bill?.status === "PAID") {
          paidRef.current = true;
          setStage("done");
        } else {
          onClose?.();
        }
      })
      .catch(() => live && onClose?.());

    return () => {
      live = false;
    };
  }, [stillPending, payment.billId, onClose]);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(String(text));
      toastSuccess(`${label} copied`);
    } catch {
      toastError("Couldn't copy — press and hold the text instead");
    }
  };

  /** A PNG the guest can scan from their gallery in any UPI app. */
  const saveQr = async () => {
    try {
      const url = await QRCode.toDataURL(upi.link, {
        width: 640,
        margin: 2,
        color: { dark: "#14120f", light: "#ffffff" },
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = `${upi.payRef || "upi-payment"}.png`;
      a.click();
    } catch {
      toastError("Couldn't save the QR");
    }
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Pay with UPI">
      <div className={styles.sheet}>
        <div className={styles.grabber} aria-hidden="true" />

        {stage === "done" ? (
          <div className="flex flex-col items-center gap-2.5 pt-10 pb-8 text-center">
            <span className={styles.tick} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
                <path
                  d="M5 12.5 10 17.5 19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <b className="text-[15px] font-[650]">Payment confirmed</b>
            <span className="text-xs text-muted tabular-nums">
              {formatPaise(upi.amountPaise)} · {hotelName}
            </span>
          </div>
        ) : (
          <>
            <p className="m-0 text-center text-[11px] font-bold tracking-[1.6px] uppercase text-muted">
              Pay {hotelName}
            </p>
            <p className="mt-1 mb-0 text-center font-display text-[30px] font-semibold tracking-[-0.9px] tabular-nums">
              {formatPaise(upi.amountPaise)}
            </p>
            <p className="mt-1 mb-0 text-center text-xs text-muted">
              to {payee}
              {upi.label ? ` · ${upi.label}` : ""}
            </p>

            {appLinks.length > 0 && (
              <div className="mt-4">
                <p className="m-0 mb-2 text-center text-[11.5px] text-muted">Pay with</p>
                <div className="grid grid-cols-3 gap-2">
                  {appLinks.map(({ app, href }) => (
                    <a
                      key={app.id}
                      href={href}
                      className="flex items-center justify-center min-h-11 px-1.5 rounded-full bg-accent text-accent-fg text-[13px] font-semibold whitespace-nowrap no-underline transition-transform active:scale-[0.98]"
                    >
                      {app.name}
                    </a>
                  ))}
                </div>
                <a
                  href={upi.link}
                  className="block w-fit mx-auto mt-1 px-3 py-2 text-xs font-semibold text-muted no-underline hover:text-ink"
                >
                  Other UPI app
                </a>
              </div>
            )}

            <div className="mt-4 flex flex-col items-center gap-2">
              {upi.amountLocked ? (
                <QrCode value={upi.link} size={176} />
              ) : (
                upi.qrImageUrl && (
                  <img
                    src={upi.qrImageUrl}
                    alt={`UPI QR for ${payee}`}
                    className="w-[176px] h-[176px] object-contain rounded-[10px] border border-hairline bg-white"
                  />
                )
              )}
              <span className="text-[11.5px] text-muted">
                {platform ? "Or scan it from another phone" : "Scan with any UPI app"}
              </span>
              {upi.amountLocked && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={saveQr}>
                  Save QR to gallery
                </button>
              )}
            </div>

            {/* A signed merchant QR cannot carry the amount, so the guest
                types it — said plainly, because a wrong amount is the one
                mistake the hotel cannot confirm. */}
            {!upi.amountLocked && (
              <p className="notice-warn mt-3 text-[12px]">
                Your UPI app will ask for the amount. Enter exactly <b>{formatPaise(upi.amountPaise)}</b>.
              </p>
            )}

            <div className="mt-4 px-3.5 rounded-token-sm border border-hairline bg-card">
              <CopyRow label="UPI ID" value={upi.vpa} onCopy={copy} />
              <CopyRow
                label="Amount"
                value={formatPaise(upi.amountPaise)}
                copyValue={(upi.amountPaise / 100).toFixed(2)}
                onCopy={copy}
              />
              {upi.payRef && (
                <CopyRow
                  label="Reference"
                  value={upi.payRef}
                  hint={upi.amountLocked ? "Already in the payment note" : "Add this to the payment note"}
                  onCopy={copy}
                />
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted" role="status">
              <span className={styles.spinner} aria-hidden="true" />
              Waiting for {hotelName} to confirm your payment
            </div>

            <button
              type="button"
              className="block w-full mt-2 p-2 border-0 bg-transparent text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              onClick={onClose}
            >
              Close — I&rsquo;ll come back to it
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Mounted only while a payment is open, and keyed on the bill and amount.
 *
 * Remounting is what resets the sheet between payments — a previous bill's
 * tick must never be the first thing shown for the next one.
 */
export const UpiPaySheet = ({ payment, hotelName, onSettled, onClose }) => {
  if (!payment?.upi) return null;
  return (
    <Sheet
      key={`${payment.billId}:${payment.upi.amountPaise}`}
      payment={payment}
      hotelName={hotelName || "the hotel"}
      onSettled={onSettled}
      onClose={onClose}
    />
  );
};
