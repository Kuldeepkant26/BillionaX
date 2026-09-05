import { useAppStore } from "../../store/useAppStore.js";
import { useBillPayment } from "../../hooks/useBillPayment.js";
import { BillCard } from "./BillCard.jsx";
import { CheckoutSheet } from "./CheckoutSheet.jsx";
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

  const { busy, checkout, start, finish, abandon, decline } = useBillPayment({
    onSettled: dismissPopup,
  });

  if (!popupBill) return null;

  const balance =
    memberships.find((m) => String(m.hotelId?._id) === String(popupBill.hotelId))?.balance || 0;

  return (
    <>
      <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="New bill">
        <div className={styles.sheet}>
          <p className={styles.kicker}>New bill</p>

          <BillCard
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

      <CheckoutSheet
        open={Boolean(checkout)}
        amountPaise={checkout?.payablePaise || 0}
        onDone={finish}
        onClose={abandon}
      />
    </>
  );
};
