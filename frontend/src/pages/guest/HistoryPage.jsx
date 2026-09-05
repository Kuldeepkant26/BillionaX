import { getTransactions } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Empty, ErrorState } from "../../components/common/index.jsx";
import { ListSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins, formatDateTime, formatCurrency, formatPaise } from "../../utils/format.js";

const LABEL = {
  WELCOME: "Welcome credit",
  EARN: "Stay reward",
  STAY: "Stay reward",
  REDEEM: "Redeemed",
  ADJUSTMENT: "Adjustment",
  REBATE: "Rebate",
};

/**
 * Bills that moved no coins, shown alongside the coin ledger.
 *
 * A cancelled bill and a bill paid entirely in cash are both invisible to the
 * ledger — they debit nothing — but from the guest's side they are the two
 * things most worth being able to look up: "did that charge go through?" and
 * "what happened to the bill I declined?". The server sends them as a separate
 * `bills` array precisely so the ledger stays a pure record of coin movement;
 * merging them is a display concern and belongs here.
 */
const BILL_LABEL = {
  PAID: "Bill paid",
  CANCELLED: "Bill cancelled",
  EXPIRED: "Bill expired",
};

/** Who voided it — declining it yourself reads very differently from the desk
 *  withdrawing it, and without this the two are indistinguishable. */
const cancelledNote = (bill) => {
  if (bill.status !== "CANCELLED") return "";
  return bill.cancelledByRole === "GUEST" ? " · you declined" : " · withdrawn by the hotel";
};

const HistoryPage = () => {
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const memberships = useAppStore((s) => s.memberships);
  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));

  const { data, loading, error, run } = useAsync(
    () => (activeHotelId ? getTransactions(activeHotelId, { limit: 50 }) : Promise.resolve(null)),
    [activeHotelId],
    { cacheKey: "guest.transactions" }
  );

  if (loading) return <ListSkeleton label="Loading your history" />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const ledger = data?.items || [];

  /**
   * One list, two sources, sorted by when each thing actually happened.
   *
   * A coin-paid bill already appears as its REDEEM ledger row, so it is
   * dropped here (`hasLedgerRow`) rather than shown twice. What survives is
   * exactly the set the ledger cannot represent.
   */
  const items = [
    ...ledger.map((t) => ({ kind: "ledger", at: t.createdAt, key: t._id, row: t })),
    ...(data?.bills || [])
      .filter((b) => !b.hasLedgerRow)
      .map((b) => ({ kind: "bill", at: b.at, key: `bill:${b.id}`, row: b })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div>
      <h1 className="display text-[22px]">Coin history</h1>
      <p className="text-muted text-[12.5px] mt-[5px] mb-[18px]">{active?.hotelId?.name}</p>

      {!items.length ? (
        <Empty title="No activity yet" hint="Your coins will appear here as you earn and spend." />
      ) : (
        <div className="flex flex-col">
          {items.map((entry) => {
            if (entry.kind === "bill") {
              const bill = entry.row;
              const settled = bill.status === "PAID";

              return (
                <div
                  key={entry.key}
                  className="flex items-center gap-[11px] py-[13px] border-b border-hairline last:border-b-0"
                >
                  <span
                    className={`w-[34px] h-[34px] rounded-[11px] grid place-items-center text-[15px] font-bold flex-none bg-chip ${
                      settled ? "text-ok" : "text-muted"
                    }`}
                  >
                    {settled ? "✓" : "×"}
                  </span>

                  <span className="flex-1 min-w-0 leading-[1.35]">
                    <b className="block text-[12.5px] font-semibold">
                      {BILL_LABEL[bill.status] || "Bill"}
                    </b>
                    <i className="not-italic text-[10.5px] text-muted">
                      {formatDateTime(entry.at)}
                      {bill.outlet ? ` · ${bill.outlet}` : ""}
                      {cancelledNote(bill)}
                    </i>
                  </span>

                  {/* The bill's own total, not a coin figure — nothing moved
                      in coins, so a +/- here would be a lie. */}
                  <span
                    className={`text-[13px] font-semibold whitespace-nowrap tabular-nums ${
                      settled ? "" : "text-muted line-through"
                    }`}
                  >
                    {formatPaise(bill.totalPaise)}
                  </span>
                </div>
              );
            }

            const t = entry.row;

            return (
              <div
                key={entry.key}
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
            );
          })}
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
