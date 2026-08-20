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
      <header className={styles.head}>
        <div>
          <h1 className={`display ${styles.title}`}>Dashboard</h1>
          <p className={styles.sub}>{d.hotel?.name}</p>
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

      <div className={styles.cols}>
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
            <div className={styles.list}>
              {d.recent.map((t) => (
                <div key={t._id} className={styles.row}>
                  <span className="avatar">{initials(t.guestId?.name)}</span>
                  <span className={styles.meta}>
                    <b>{t.guestId?.name || "Guest"}</b>
                    <i>
                      {LABEL[t.type]} · {formatDateTime(t.createdAt)}
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
        </Card>
      </div>

      <div className={styles.cols}>
        <Card title="Members">
          <div className={styles.pair}>
            <span>
              <u>Total members</u>
              <b>{formatCoins(d.members)}</b>
            </span>
            <span>
              <u>Coins outstanding</u>
              <b>{formatCoinsCompact(d.outstandingCoins)}</b>
            </span>
          </div>
          <p className={styles.note}>
            Outstanding coins are a liability — guests can spend them against future bills here.
          </p>
        </Card>

        <Card title="Right now">
          <div className={styles.live}>
            <span className={styles.pulse} />
            <b>{d.activeVouchers || 0} codes running</b>
            <i>Guests waiting to pay at an outlet</i>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default HotelDashboardPage;
