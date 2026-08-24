import { dashboard } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Card, ErrorState, Kpi, Loading, Empty } from "../../components/common/index.jsx";
import { BarSeries } from "../../features/panel/BarSeries.jsx";
import {
  formatCoins,
  formatCoinsCompact,
  formatCompact,
  formatDateTime,
  initials,
} from "../../utils/format.js";
import styles from "./HotelDashboardPage.module.css";

const LABEL = { WELCOME: "Welcome credit", EARN: "Stay reward", REDEEM: "Redeemed", ADJUSTMENT: "Adjustment" };

const HotelDashboardPage = () => {
  const { data, loading, error, run } = useAsync(dashboard, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const d = data || {};

  return (
    <div>
      <header className="mb-5">
        <div>
          <h1 className="display text-[26px] tracking-[-0.6px]">Dashboard</h1>
          <p className="text-muted text-[12.5px] mt-1">{d.hotel?.name}</p>
        </div>
      </header>

      <div className="kpis">
        <Kpi label="New members today" value={d.today?.newMembers ?? 0} />
        <Kpi label="Coins redeemed today" value={formatCoinsCompact(d.today?.coinsRedeemed)} />
        <Kpi label="Revenue today" value={formatCompact(d.today?.revenue)} delta={`${d.today?.bills || 0} bills`} />
        <Kpi
          label="Coin inventory"
          value={formatCoinsCompact(d.hotel?.coinInventory)}
          delta={d.hotel?.coinInventory < 10000 ? "Running low" : "Healthy"}
          tone={d.hotel?.coinInventory < 10000 ? "bad" : "ok"}
        />
      </div>

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[1.4fr_1fr] gap-4 mt-4 items-start">
        <Card title="Coin flow, last 7 days">
          <BarSeries
            series={d.series || []}
            bars={[
              { key: "earned", label: "Earned" },
              { key: "redeemed", label: "Redeemed" },
            ]}
          />
        </Card>

        <Card title="Latest activity">
          {!d.recent?.length ? (
            <Empty title="No activity yet" hint="Transactions will appear here." />
          ) : (
            <div className="flex flex-col">
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

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[1.4fr_1fr] gap-4 mt-4 items-start">
        <Card title="Members">
          <div className="grid grid-cols-2 gap-3">
            <span>
              <u className="block no-underline text-[9.5px] tracking-[0.09em] uppercase text-muted font-bold">Total members</u>
              <b className="block font-display text-2xl font-semibold mt-1">{formatCoins(d.members)}</b>
            </span>
            <span>
              <u className="block no-underline text-[9.5px] tracking-[0.09em] uppercase text-muted font-bold">Coins outstanding</u>
              <b className="block font-display text-2xl font-semibold mt-1">{formatCoinsCompact(d.outstandingCoins)}</b>
            </span>
          </div>
          <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
            Outstanding coins are a liability — guests can spend them against future bills here.
          </p>
        </Card>

        <Card title="Right now">
          <div className="bg-[var(--soft)] rounded-token-sm p-3.5 relative">
            <span
              className={`absolute top-3.5 right-3.5 w-[9px] h-[9px] rounded-full bg-[var(--acc2)] ${styles.pulse}`}
            />
            <b className="block font-display text-[17px] font-semibold">{d.activeVouchers || 0} codes running</b>
            <i className="not-italic text-[11.5px] text-muted">Guests waiting to pay at an outlet</i>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default HotelDashboardPage;
