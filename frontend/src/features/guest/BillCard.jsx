import { useMemo, useState } from "react";
import { Button, Slider } from "../../components/common/index.jsx";
import { formatCoins, formatPaise } from "../../utils/format.js";
import styles from "./BillCard.module.css";

/**
 * One bill, with its coin slider and the two actions.
 *
 * Shared by the Pay screen and the popup rather than written twice: the amount
 * a guest is about to pay must not be able to differ between two renderings of
 * the same bill, and duplicating this arithmetic is exactly how that happens.
 *
 * The slider is capped by the hotel's tier allowance and the guest's balance.
 * That cap is enforced again server-side on every payment — the slider is a
 * convenience, never the authority.
 */
export const BillCard = ({
  bill,
  balance = 0,
  busy = false,
  onPay,
  onCancel,
  onDismiss,
  compact = false,
}) => {
  /**
   * How much of this bill coins may cover, in whole coins (1 coin = ₹1).
   *
   * Prefers the balance the bill itself carries over the one in the membership
   * list: the popup can render before that list has loaded, and falling back to
   * zero there would hide the slider entirely on a bill that qualifies for it.
   */
  const effectiveBalance = bill.coinBalance ?? balance ?? 0;

  const capCoins = useMemo(() => {
    /**
     * TWO SHAPES, mirroring computeBillCoins on the server — the platform's
     * only two copies of this rule, and they must move together.
     *
     * A bill raised since per-service caps carries an absolute allowance,
     * already resolved from each line's service. One raised before carries only
     * a percentage. The `== null` test is explicit and never falsy: an
     * allowance of 0 means "coins are refused on this bill", and reading it as
     * absent would show a slider the server will clamp to nothing.
     */
    const capPaise =
      bill.coinAllowancePaise == null
        ? Math.floor((bill.totalPaise * (bill.tierCapPercent || 0)) / 100)
        : Math.min(bill.coinAllowancePaise, bill.totalPaise);

    return Math.min(Math.floor(capPaise / 100), Math.floor(effectiveBalance));
  }, [bill.totalPaise, bill.tierCapPercent, bill.coinAllowancePaise, effectiveBalance]);

  const [coins, setCoins] = useState(0);

  const applied = Math.min(coins, capCoins);
  const payablePaise = Math.max(0, bill.totalPaise - applied * 100);

  return (
    <article className={`${styles.card} ${compact ? styles.compact : ""}`}>
      <header className={styles.head}>
        {bill.hotel?.logoUrl ? (
          <img src={bill.hotel.logoUrl} alt="" className={styles.logo} />
        ) : (
          <span className={styles.logoFallback} aria-hidden="true">
            {(bill.hotel?.name || "H").slice(0, 1)}
          </span>
        )}
        <span className={styles.headText}>
          <b>{bill.hotel?.name || "Your hotel"}</b>
          {bill.outlet && <i>{bill.outlet}</i>}
        </span>
      </header>

      <ul className={styles.items}>
        {bill.lineItems.map((item, i) => (
          <li key={i}>
            <span className={styles.itemName}>
              {item.description}
              {item.qty > 1 && <em>×{item.qty}</em>}
            </span>
            <span className={styles.itemAmount}>{formatPaise(item.amountPaise)}</span>
          </li>
        ))}
      </ul>

      <div className={styles.sums}>
        <div>
          <span>Subtotal</span>
          <b>{formatPaise(bill.subtotalPaise)}</b>
        </div>
        {bill.taxPaise > 0 && (
          <div>
            <span>Tax {bill.taxPercent ? `(${bill.taxPercent}%)` : ""}</span>
            <b>{formatPaise(bill.taxPaise)}</b>
          </div>
        )}
        {applied > 0 && (
          <div className={styles.discount}>
            <span>Coins applied</span>
            <b>−{formatPaise(applied * 100)}</b>
          </div>
        )}
      </div>

      <div className={styles.total}>
        <span>To pay</span>
        <b>{formatPaise(payablePaise)}</b>
      </div>

      {/* Only offered when coins can actually move the total — a slider that
          cannot change anything is noise at the moment of payment. */}
      {capCoins > 0 && (
        <div className={styles.coins}>
          <div className={styles.coinsTop}>
            <span>Use your coins</span>
            <b>
              {formatCoins(applied)} / {formatCoins(capCoins)}
            </b>
          </div>

          <Slider
            value={applied}
            onChange={(e) => setCoins(Number(e.target.value) || 0)}
            min={0}
            max={capCoins}
            step={1}
          />

          {/* An amount, not a percentage. With per-service caps there is often
              no single rate that describes a bill — ₹2000 at 20% beside ₹3000
              at 0% is neither of those numbers — but the amount is always
              true. */}
          <p className={styles.coinsHint}>
            Up to {formatPaise(capCoins * 100)} of this bill can be paid with coins. You have{" "}
            {formatCoins(effectiveBalance)}.
          </p>
        </div>
      )}

      {/* The slider is hidden when nothing can be applied, which on a bill of
          nothing but a no-coins service would look like the feature is broken.
          Guarded on actually holding coins, so a guest with none is not told
          about something they could not have used anyway. */}
      {capCoins === 0 && effectiveBalance > 0 && (
        <p className={styles.coinsHint}>Coins can&rsquo;t be used on this bill.</p>
      )}

      <div className={styles.actions}>
        <Button block onClick={() => onPay(applied)} disabled={busy}>
          {busy ? "Processing…" : `Pay ${formatPaise(payablePaise)}`}
        </Button>

        <div className={styles.secondary}>
          {/* Dismissing and declining are deliberately different. A guest who
              cannot pay this second should not have to reject a legitimate
              bill and make staff send it again. */}
          {onDismiss && (
            <button type="button" onClick={onDismiss} disabled={busy}>
              Not now
            </button>
          )}
          {onCancel && (
            <button type="button" className={styles.decline} onClick={onCancel} disabled={busy}>
              Cancel bill
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
