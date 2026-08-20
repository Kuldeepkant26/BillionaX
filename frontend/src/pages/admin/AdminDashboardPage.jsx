import { dashboard } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Card, Empty, ErrorState, Kpi, Loading } from "../../components/common/index.jsx";
import { BarSeries } from "../../features/panel/BarSeries.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatCoinsCompact, formatCompact, initials } from "../../utils/format.js";
import styles from "./AdminDashboardPage.module.css";

const AdminDashboardPage = () => {
  const { data, loading, error, run } = useAsync(dashboard, []);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const d = data || {};

  return (
    <div>
      <PageHead title="Overview" subtitle="Billionax network at a glance" />

      <div className="kpis">
        <Kpi label="Commission earned" value={formatCompact(d.commission)} delta={`${d.bills || 0} bills`} tone="ok" />
        <Kpi label="Guest revenue" value={formatCompact(d.revenue)} />
        <Kpi label="Hotels live" value={d.hotels?.active ?? 0} delta={`${d.hotels?.total || 0} total`} />
        <Kpi label="Guests" value={d.guests ?? 0} delta={`${d.memberships || 0} memberships`} />
      </div>

      <div className={styles.cols}>
        <Card title="Coin flow, last 7 days">
          <BarSeries
            series={d.series || []}
            bars={[
              { key: "earned", label: "Issued" },
              { key: "redeemed", label: "Redeemed" },
            ]}
          />
        </Card>

        <Card title="Top hotels">
          {!d.topHotels?.length ? (
            <Empty title="No revenue yet" hint="Hotel performance appears here." />
          ) : (
            <div className={styles.list}>
              {d.topHotels.map((h) => (
                <div key={h._id} className={styles.row}>
                  <span className="avatar">{initials(h.name)}</span>
                  <span className={styles.meta}>
                    <b>{h.name}</b>
                    <i>
                      {h.city} · {h.bills} bills
                    </i>
                  </span>
                  <span className={styles.amount}>{formatCompact(h.fee)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className={styles.cols}>
        <Card title="Coin liability">
          <div className={styles.liability}>
            <span>
              <u>Outstanding with guests</u>
              <b>{formatCoinsCompact(d.coins?.outstanding)}</b>
            </span>
            <span>
              <u>Held by hotels</u>
              <b>{formatCoinsCompact(d.coins?.inventory)}</b>
            </span>
          </div>
          <p className={styles.note}>
            Outstanding coins are a real liability — every one is a discount a hotel has already
            promised a guest. Watch this against coins sold.
          </p>
        </Card>

        <Card title="Coins sold vs used">
          <div className={styles.liability}>
            <span>
              <u>Sold to hotels</u>
              <b>{formatCoinsCompact(d.coins?.purchased)}</b>
            </span>
            <span>
              <u>Redeemed by guests</u>
              <b>{formatCoinsCompact(d.coins?.redeemed)}</b>
            </span>
          </div>
          <p className={styles.note}>
            Allocated but unredeemed coins sit with guests until they spend them at that hotel.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
