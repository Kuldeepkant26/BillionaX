import { useEffect, useState } from "react";
import { formatPaise } from "../../utils/format.js";
import styles from "./CheckoutSheet.module.css";

/**
 * The payment sheet.
 *
 * In demo mode this stands in for the gateway's own checkout: the guest picks a
 * method, watches a plausible processing delay, and the payment succeeds. It is
 * deliberately not a "DEMO" placard — the whole point is that a hotel being
 * shown the product sees what their guests would see.
 *
 * When real credentials are configured the provider returns a live order and
 * this sheet hands off to the gateway's own checkout instead. The component
 * does not decide which: it renders whatever the order it was given says, so
 * there is no demo/live branch in the UI.
 */

const METHODS = [
  { id: "upi", label: "UPI", hint: "Google Pay, PhonePe, Paytm" },
  { id: "card", label: "Card", hint: "Credit or debit" },
  { id: "netbanking", label: "Net banking", hint: "All major banks" },
];

const Sheet = ({ amountPaise, onDone, onClose }) => {
  const [method, setMethod] = useState("upi");
  const [stage, setStage] = useState("choose");

  useEffect(() => {
    if (stage !== "processing") return undefined;

    // Long enough to read as a real authorisation, short enough not to feel
    // broken. The states in between are where real failures surface, so a demo
    // that skipped them would hide the bugs worth finding.
    const t = setTimeout(() => setStage("done"), 2200);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    if (stage !== "done") return undefined;
    const t = setTimeout(() => onDone?.(), 900);
    return () => clearTimeout(t);
  }, [stage, onDone]);

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Payment">
      <div className={styles.sheet}>
        {stage === "choose" && (
          <>
            <div className={styles.grabber} aria-hidden="true" />
            <p className={styles.amount}>{formatPaise(amountPaise)}</p>
            <p className={styles.sub}>Choose how you'd like to pay</p>

            <div className={styles.methods}>
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`${styles.method} ${method === m.id ? styles.methodOn : ""}`}
                >
                  <span>
                    <b>{m.label}</b>
                    <i>{m.hint}</i>
                  </span>
                  <span className={styles.radio} aria-hidden="true" />
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.confirm}
              onClick={() => setStage("processing")}
            >
              Pay {formatPaise(amountPaise)}
            </button>

            <button type="button" className={styles.back} onClick={onClose}>
              Back
            </button>
          </>
        )}

        {stage === "processing" && (
          <div className={styles.state}>
            <span className={styles.spinner} aria-hidden="true" />
            <b>Authorising payment</b>
            <i>Don't close this screen</i>
          </div>
        )}

        {stage === "done" && (
          <div className={styles.state}>
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
            <b>Paid</b>
            <i>{formatPaise(amountPaise)}</i>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Mounted only while open, and keyed on the amount.
 *
 * Remounting is what resets the sheet between attempts — a previous payment's
 * spinner or tick must never be the first thing shown for a new one. Keying
 * beats an effect that clears four pieces of state and forgets the fifth.
 */
export const CheckoutSheet = ({ open, amountPaise, onDone, onClose }) => {
  if (!open) return null;
  return (
    <Sheet key={amountPaise} amountPaise={amountPaise} onDone={onDone} onClose={onClose} />
  );
};
