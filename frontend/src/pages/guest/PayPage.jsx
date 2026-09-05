import { useAppStore } from "../../store/useAppStore.js";
import { useBillPayment } from "../../hooks/useBillPayment.js";
import { BillCard } from "../../features/guest/BillCard.jsx";
import { CheckoutSheet } from "../../features/guest/CheckoutSheet.jsx";
import { formatCoins, formatPaise } from "../../utils/format.js";
import styles from "./PayPage.module.css";

/**
 * Bills waiting to be paid.
 *
 * Kept live by useBillRealtime in GuestLayout, so a bill sent while this screen
 * is open appears on its own and one paid on another device disappears.
 *
 * The screen leads with what a guest actually wants to know — how much is owed
 * and what they can knock off it with coins — before the bills themselves. With
 * nothing outstanding that header becomes the reassurance ("you're all settled")
 * rather than an empty rectangle.
 */
const PayPage = () => {
  const pendingBills = useAppStore((s) => s.pendingBills);
  const memberships = useAppStore((s) => s.memberships);
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const { busy, checkout, start, finish, abandon, decline } = useBillPayment();

  const balanceFor = (hotelId) =>
    memberships.find((m) => String(m.hotelId?._id) === String(hotelId))?.balance || 0;

  // The bill carries its own balance; the membership list is the fallback for
  // a screen opened before that list has loaded.
  const coinBalance = pendingBills[0]?.coinBalance ?? balanceFor(activeHotelId);

  const duePaise = pendingBills.reduce((sum, bill) => sum + bill.totalPaise, 0);
  const count = pendingBills.length;

  return (
    <div className={styles.page}>
      {/*
        The summary is the header, not a card. It answers the only two questions
        the screen exists for, and it is deliberately the same shape whether
        anything is owed or not, so arriving here never feels like a dead end.
      */}
      <header className={`${styles.hero} ${count ? styles.heroDue : ""}`}>
        <span className={styles.heroLabel}>{count ? "Total due" : "You're all settled"}</span>

        <b className={styles.heroAmount}>{count ? formatPaise(duePaise) : "₹0"}</b>

        <span className={styles.heroMeta}>
          {count ? (
            <>
              {count} {count === 1 ? "bill" : "bills"} waiting ·{" "}
              <em>{formatCoins(coinBalance)} coins available</em>
            </>
          ) : (
            <>
              <em>{formatCoins(coinBalance)} coins</em> ready for your next bill
            </>
          )}
        </span>
      </header>

      {!count ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none">
              <path
                d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 15.5z"
                stroke="currentColor"
                strokeWidth="1.6"
              />
              <path d="M4 10.5h16" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </span>
          <b>Nothing to pay right now</b>
          <p>
            When the desk sends you a bill it appears here straight away — and on whatever screen
            you happen to be on.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.listHead}>
            <span className="kicker">Awaiting payment</span>
          </div>

          <div className={styles.list}>
            {pendingBills.map((bill) => (
              <BillCard
                key={bill.id}
                bill={bill}
                balance={balanceFor(bill.hotelId)}
                busy={busy}
                onPay={(coins) => start(bill, coins)}
                onCancel={() => decline(bill)}
              />
            ))}
          </div>

          <p className={styles.footnote}>
            Paid in the app — nothing to show at the desk. Coins come off before the amount you
            are charged.
          </p>
        </>
      )}

      <CheckoutSheet
        open={Boolean(checkout)}
        amountPaise={checkout?.payablePaise || 0}
        onDone={finish}
        onClose={abandon}
      />
    </div>
  );
};

export default PayPage;
