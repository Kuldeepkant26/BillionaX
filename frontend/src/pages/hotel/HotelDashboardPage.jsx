import { dashboard, monthlyRedemptions } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Card, ErrorState, Kpi, Loading, Empty } from "../../components/common/index.jsx";
import { CoinFlowChart } from "../../features/panel/charts/CoinFlowChart.jsx";
import { RatioDonut } from "../../features/panel/charts/RatioDonut.jsx";
import MonthlyRedemptions from "../../features/panel/MonthlyRedemptions.jsx";
import {
  formatCoins,
  formatCoinsCompact,
  formatCompact,
  formatDateTime,
  greeting,
  initials,
} from "../../utils/format.js";
import styles from "./HotelDashboardPage.module.css";

const LABEL = { WELCOME: "Welcome credit", EARN: "Stay reward", REDEEM: "Redeemed", ADJUSTMENT: "Adjustment" };

const LOW_INVENTORY = 10000;

const icon = (d) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  coin: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6z",
  trend: "M11 4h6v6h-2V7.4l-4.6 4.6-3-3L3 13.4 1.6 12l5.8-5.8 3 3L15.6 6H11z",
  guests:
    "M7 9.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zm6.4.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM1.4 17c.5-3.1 2.8-5 5.6-5s5.1 1.9 5.6 5H1.4zm13 0c-.2-1.8-1-3.3-2.1-4.4.4-.1.7-.1 1.1-.1 2.4 0 4.4 1.6 4.9 4.5h-3.9z",
  wallet:
    "M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H5a2 2 0 0 0 0 4h12v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
};

const HotelDashboardPage = () => {
  // Cached: the dashboard is the panel's hub and staff return to it between
  // every other screen. It revalidates in the background on each visit, so the
  // figures stay live without the page blanking to a spinner each time.
  const { data, loading, error, run } = useAsync(dashboard, [], {
    cacheKey: "hotel.dashboard",
  });

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const d = data || {};

  return (
    <div>
      <header className="mb-5">
        <div>
          <h1 className="display text-[26px] tracking-[-0.6px]">{greeting()}</h1>
          <p className="text-muted text-[12.5px] mt-1">{d.hotel?.name}</p>
        </div>
      </header>

      <div className="kpis">
        <Kpi
          label="New members today"
          value={d.today?.newMembers ?? 0}
          icon={icon(ICONS.guests)}
        />
        <Kpi
          label="Coins redeemed today"
          value={formatCoinsCompact(d.today?.coinsRedeemed)}
          icon={icon(ICONS.coin)}
        />
        <Kpi
          label="Revenue today"
          value={formatCompact(d.today?.revenue)}
          delta={`${d.today?.bills || 0} bills`}
          icon={icon(ICONS.trend)}
        />
        <Kpi
          label="Coin inventory"
          value={formatCoinsCompact(d.hotel?.coinInventory)}
          delta={d.hotel?.coinInventory < LOW_INVENTORY ? "Running low" : "Healthy"}
          tone={d.hotel?.coinInventory < LOW_INVENTORY ? "bad" : "ok"}
          // Full ring at twice the low-water mark, so "half a ring" is exactly
          // the point where the label flips to "Running low".
          progress={Math.min(100, ((d.hotel?.coinInventory || 0) / (LOW_INVENTORY * 2)) * 100)}
        />
      </div>

      {/*
        No items-start on these pairs: the two cards in a row are a set, and
        letting each size to its own content left the shorter one floating
        against a column of dead space. Stretched, they share the row's height
        and the longer list scrolls inside its own card instead.
      */}
      <div className="grid grid-cols-1 [@media(min-width:1100px)]:grid-cols-[1.5fr_1fr] gap-4 mt-4">
        <Card title="Coin flow, last 7 days" className={styles.pairCard}>
          <CoinFlowChart
            series={d.series || []}
            bars={[
              { key: "earned", label: "Earned" },
              { key: "redeemed", label: "Redeemed" },
            ]}
          />
        </Card>

        <Card title="Latest activity" className={styles.pairCard}>
          {!d.recent?.length ? (
            <Empty title="No activity yet" hint="Transactions will appear here." />
          ) : (
            <div className={`flex flex-col ${styles.grow} ${styles.activityList}`}>
              {d.recent.map((t) => (
                <div
                  key={t._id}
                  className="flex items-center gap-[11px] py-2.5 border-b border-hairline last:border-b-0"
                >
                  <span className="avatar">{initials(t.guestId?.name)}</span>
                  <span className="flex-1 min-w-0 leading-[1.3]">
                    <b className="block text-[12.5px] font-semibold">{t.guestId?.name || "Guest"}</b>
                    <i className="not-italic text-[11px] text-muted">
                      {LABEL[t.type]} · {formatDateTime(t.createdAt)}
                    </i>
                  </span>
                  <span
                    className={`text-[12.5px] font-semibold whitespace-nowrap tabular-nums ${
                      t.coins > 0 ? "text-[var(--ok)]" : ""
                    }`}
                  >
                    {t.coins > 0 ? "+" : "−"}
                    {formatCoins(Math.abs(t.coins))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 [@media(min-width:1100px)]:grid-cols-[1.5fr_1fr] gap-4 mt-4">
        <Card title="Coin inventory in play" className={styles.pairCard}>
          <RatioDonut
            value={d.outstandingCoins || 0}
            total={(d.outstandingCoins || 0) + (d.hotel?.coinInventory || 0)}
            valueLabel="Outstanding with guests"
            totalLabel="Still in your inventory"
            format={formatCoinsCompact}
          />
          <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
            Outstanding coins are a liability — guests can spend them against future bills here.
            Across {formatCoins(d.members)} member{d.members === 1 ? "" : "s"}.
          </p>
        </Card>

        <Card title="Right now" className={styles.pairCard}>
          <div className="bg-[var(--soft)] rounded-token-sm p-3.5 relative">
            <span
              className={`absolute top-3.5 right-3.5 w-[9px] h-[9px] rounded-full bg-[var(--acc2)] ${styles.pulse}`}
            />
            <b className="block font-display text-[17px] font-semibold">{d.pendingBills || 0} bills awaiting payment</b>
            <i className="not-italic text-[11.5px] text-muted">Sent to guests, not yet settled</i>
          </div>
        </Card>
      </div>

      {/*
        The hotel's own redemptions by month, with the rebate credited against
        each. Scoped server-side from the session, so a hotel only ever sees
        its own figures.
      */}
      <div className="mt-4">
        <MonthlyRedemptions
          fetcher={monthlyRedemptions}
          title="Coins redeemed by month"
        />
      </div>
    </div>
  );
};

export default HotelDashboardPage;
