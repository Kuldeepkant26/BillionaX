import { useAppStore } from "../../store/useAppStore.js";
import { useBillPayment } from "../../hooks/useBillPayment.js";
import { BillCard } from "./BillCard.jsx";
import { UpiPaySheet } from "./UpiPaySheet.jsx";
import styles from "./BillPopup.module.css";

/**
 * A bill arriving while the guest is somewhere else in the app.
 *
 * Mounted once in GuestLayout so it can appear over any screen. It is NOT
 * dismissible by the backdrop or Escape: a charge that vanishes because of a
 * stray tap leaves the guest at the desk with nothing to pay and staff
 * wondering what happened.
 *
 * Three actions rather than two, because declining and deferring are different
 * things. "Not now" hides this and leaves the bill on the Pay screen; "Cancel
 * bill" rejects it and tells staff. Collapsing them would force a guest who
 * simply is not ready to reject a legitimate charge.
 */
export const BillPopup = () => {
  const popupBill = useAppStore((s) => s.popupBill);
  const memberships = useAppStore((s) => s.memberships);
  const dismissPopup = useAppStore((s) => s.dismissPopup);

  /*
   * No onSettled here. Every way a bill ends — paid, declined, voided —
   * already runs removeBill, which advances the popup to the next waiting
   * bill. Dismissing on top of that skipped the bill it had just advanced to.
   */
  const { busy, payment, start, settled, close, decline } = useBillPayment();

  const balance = popupBill
    ? memberships.find((m) => String(m.hotelId?._id) === String(popupBill.hotelId))?.balance || 0
    : 0;

  return (
    <>
      {/* The card goes as soon as the bill leaves the list; the sheet below
          must NOT go with it. The hotel confirming is exactly what removes the
          bill, and the sheet has to outlive that to show the tick. */}
      {popupBill && !payment && (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="New bill">
          <div className={styles.sheet}>
            <p className={styles.kicker}>New bill</p>

            <BillCard
              key={popupBill.id}
              compact
              bill={popupBill}
              balance={balance}
              busy={busy}
              onPay={(coins) => start(popupBill, coins)}
              onCancel={() => decline(popupBill)}
              onDismiss={dismissPopup}
            />
          </div>
        </div>
      )}

      <UpiPaySheet
        payment={payment}
        hotelName={payment?.bill?.hotel?.name}
        onSettled={settled}
        onClose={close}
      />
    </>
  );
};
