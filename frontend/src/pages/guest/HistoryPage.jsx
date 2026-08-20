import { getTransactions } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Empty, ErrorState } from "../../components/common/index.jsx";
import { ListSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins, formatDateTime, formatCurrency } from "../../utils/format.js";
import styles from "./HistoryPage.module.css";

const LABEL = {
  WELCOME: "Welcome credit",
  EARN: "Stay reward",
  REDEEM: "Redeemed",
  ADJUSTMENT: "Adjustment",
};

const HistoryPage = () => {
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const memberships = useAppStore((s) => s.memberships);
  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));

  const { data, loading, error, run } = useAsync(
    () => (activeHotelId ? getTransactions(activeHotelId, { limit: 50 }) : Promise.resolve(null)),
    [activeHotelId]
  );

  if (loading) return <ListSkeleton label="Loading your history" />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const items = data?.items || [];

  return (
    <div>
      <h1 className={`display ${styles.title}`}>Coin history</h1>
      <p className={styles.sub}>{active?.hotelId?.name}</p>

      {!items.length ? (
        <Empty title="No activity yet" hint="Your coins will appear here as you earn and spend." />
      ) : (
        <div className={styles.list}>
          {items.map((t) => (
            <div key={t._id} className={styles.row}>
              <span className={`${styles.icon} ${t.coins > 0 ? styles.plus : styles.minus}`}>
                {t.coins > 0 ? "+" : "−"}
              </span>

              <span className={styles.meta}>
                <b>{LABEL[t.type] || t.type}</b>
                <i>
                  {formatDateTime(t.createdAt)}
                  {t.outlet ? ` · ${t.outlet}` : ""}
                  {t.billAmount ? ` · bill ${formatCurrency(t.billAmount)}` : ""}
                </i>
              </span>

              <span className={`${styles.amount} ${t.coins > 0 ? styles.up : ""}`}>
                {t.coins > 0 ? "+" : "−"}
                {formatCoins(Math.abs(t.coins))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
