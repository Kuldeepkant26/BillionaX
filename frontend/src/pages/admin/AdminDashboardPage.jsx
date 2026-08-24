import { dashboard } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Card, Empty, ErrorState, Kpi, Loading } from "../../components/common/index.jsx";
import { BarSeries } from "../../features/panel/BarSeries.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatCoinsCompact, formatCompact, initials } from "../../utils/format.js";

// Shared by the four liability figures below.
const liabLabel = "block no-underline text-[9.5px] tracking-[0.09em] uppercase text-muted font-bold";
const liabValue = "block font-display text-2xl font-semibold mt-1";

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

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[1.4fr_1fr] gap-4 mt-4 items-start">
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
            <div className="flex flex-col">
              {d.topHotels.map((h) => (
                <div
                  key={h._id}
                  className="flex items-center gap-[11px] py-2.5 border-b border-hairline last:border-b-0"
                >
                  <span className="avatar">{initials(h.name)}</span>
                  <span className="flex-1 min-w-0 leading-[1.3]">
                    <b className="block text-[12.5px] font-semibold">{h.name}</b>
                    <i className="not-italic text-[11px] text-muted">
                      {h.city} · {h.bills} bills
                    </i>
                  </span>
                  <span className="text-[12.5px] font-semibold whitespace-nowrap">{formatCompact(h.fee)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[1.4fr_1fr] gap-4 mt-4 items-start">
        <Card title="Coin liability">
          <div className="grid grid-cols-2 gap-3">
            <span>
              <u className={liabLabel}>Outstanding with guests</u>
              <b className={liabValue}>{formatCoinsCompact(d.coins?.outstanding)}</b>
            </span>
            <span>
              <u className={liabLabel}>Held by hotels</u>
              <b className={liabValue}>{formatCoinsCompact(d.coins?.inventory)}</b>
            </span>
          </div>
          <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
            Outstanding coins are a real liability — every one is a discount a hotel has already
            promised a guest. Watch this against coins sold.
          </p>
        </Card>

        <Card title="Coins sold vs used">
          <div className="grid grid-cols-2 gap-3">
            <span>
              <u className={liabLabel}>Sold to hotels</u>
              <b className={liabValue}>{formatCoinsCompact(d.coins?.purchased)}</b>
            </span>
            <span>
              <u className={liabLabel}>Redeemed by guests</u>
              <b className={liabValue}>{formatCoinsCompact(d.coins?.redeemed)}</b>
            </span>
          </div>
          <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
            Allocated but unredeemed coins sit with guests until they spend them at that hotel.
          </p>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
