import { getTransactions } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Empty, ErrorState } from "../../components/common/index.jsx";
import { ListSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins, formatDateTime, formatCurrency } from "../../utils/format.js";

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
      <h1 className="display text-[22px]">Coin history</h1>
      <p className="text-muted text-[12.5px] mt-[5px] mb-[18px]">{active?.hotelId?.name}</p>

      {!items.length ? (
        <Empty title="No activity yet" hint="Your coins will appear here as you earn and spend." />
      ) : (
        <div className="flex flex-col">
          {items.map((t) => (
            <div
              key={t._id}
              className="flex items-center gap-[11px] py-[13px] border-b border-hairline last:border-b-0"
            >
              <span
                className={`w-[34px] h-[34px] rounded-[11px] grid place-items-center text-[15px] font-bold flex-none ${
                  t.coins > 0 ? "bg-[var(--soft)] text-accent" : "bg-chip text-muted"
                }`}
              >
                {t.coins > 0 ? "+" : "−"}
              </span>

              <span className="flex-1 min-w-0 leading-[1.35]">
                <b className="block text-[12.5px] font-semibold">{LABEL[t.type] || t.type}</b>
                <i className="not-italic text-[10.5px] text-muted">
                  {formatDateTime(t.createdAt)}
                  {t.outlet ? ` · ${t.outlet}` : ""}
                  {t.billAmount ? ` · bill ${formatCurrency(t.billAmount)}` : ""}
                </i>
              </span>

              <span
                className={`text-[13px] font-semibold whitespace-nowrap tabular-nums ${
                  t.coins > 0 ? "text-accent" : ""
                }`}
              >
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
