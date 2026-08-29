import { dashboard, monthlyRedemptions } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Card, Empty, ErrorState, Kpi, Loading } from "../../components/common/index.jsx";
import { CoinFlowChart } from "../../features/panel/charts/CoinFlowChart.jsx";
import { RankedBars } from "../../features/panel/charts/RankedBars.jsx";
import { RatioDonut } from "../../features/panel/charts/RatioDonut.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import MonthlyRedemptions from "../../features/panel/MonthlyRedemptions.jsx";
import RebateRunner from "../../features/panel/RebateRunner.jsx";
import { ROUTES } from "../../constants/routePaths.js";
import { formatCoinsCompact, formatCompact } from "../../utils/format.js";

// Shared by the liability figures below.
const liabLabel = "block no-underline text-[9.5px] tracking-[0.09em] uppercase text-muted font-bold";
const liabValue = "block font-display text-2xl font-semibold mt-1";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const icon = (d) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  coin: "M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm0 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6z",
  trend: "M11 4h6v6h-2V7.4l-4.6 4.6-3-3L3 13.4 1.6 12l5.8-5.8 3 3L15.6 6H11z",
  hotel:
    "M5 3a1 1 0 0 0-1 1v13h4v-3h4v3h4V4a1 1 0 0 0-1-1H5zm1.5 2.5h2v2h-2v-2zm5 0h2v2h-2v-2zm-5 4h2v2h-2v-2zm5 0h2v2h-2v-2z",
  guests:
    "M7 9.2a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2zm6.4.4a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2zM1.4 17c.5-3.1 2.8-5 5.6-5s5.1 1.9 5.6 5H1.4zm13 0c-.2-1.8-1-3.3-2.1-4.4.4-.1.7-.1 1.1-.1 2.4 0 4.4 1.6 4.9 4.5h-3.9z",
};

const AdminDashboardPage = () => {
  const { data, loading, error, run } = useAsync(dashboard, []);
  const user = useAppStore((s) => s.user);

  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={run} />;

  const d = data || {};
  const firstName = user?.name?.split(" ")[0];

  return (
    <div>
      <PageHead
        title={firstName ? `${greeting()}, ${firstName}` : greeting()}
        subtitle="The Billionax network at a glance"
      />

      <div className="kpis">
        <Kpi
          label="Commission earned"
          value={formatCompact(d.commission)}
          delta={`${d.bills || 0} bills`}
          tone="ok"
          icon={icon(ICONS.coin)}
          to={ROUTES.ADMIN_TRANSACTIONS}
        />
        <Kpi label="Guest revenue" value={formatCompact(d.revenue)} icon={icon(ICONS.trend)} />
        <Kpi
          label="Hotels live"
          value={d.hotels?.active ?? 0}
          delta={`${d.hotels?.total || 0} total`}
          icon={icon(ICONS.hotel)}
          to={ROUTES.ADMIN_HOTELS}
        />
        <Kpi
          label="Guests"
          value={d.guests ?? 0}
          delta={`${d.memberships || 0} memberships`}
          icon={icon(ICONS.guests)}
          to={ROUTES.ADMIN_GUESTS}
        />
      </div>

      <div className="grid grid-cols-1 [@media(min-width:1100px)]:grid-cols-[1.5fr_1fr] gap-4 mt-4 items-start">
        <Card title="Coin flow, last 7 days">
          <CoinFlowChart
            series={d.series || []}
            bars={[
              { key: "earned", label: "Issued" },
              { key: "redeemed", label: "Redeemed" },
            ]}
          />
        </Card>

        <Card title="Top hotels by commission">
          {!d.topHotels?.length ? (
            <Empty title="No revenue yet" hint="Hotel performance appears here." />
          ) : (
            <>
              <RankedBars
                data={d.topHotels.map((h) => ({ name: h.name, fee: h.fee, city: h.city }))}
                valueKey="fee"
                label="Commission"
                format={formatCompact}
              />
              <p className="text-[11.5px] text-muted leading-[1.5] mt-2">
                {d.topHotels.length} highest-earning propert
                {d.topHotels.length === 1 ? "y" : "ies"} this period.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 [@media(min-width:1100px)]:grid-cols-2 gap-4 mt-4 items-start">
        <Card title="Coins sold vs redeemed">
          <RatioDonut
            value={d.coins?.redeemed || 0}
            total={d.coins?.purchased || 0}
            valueLabel="Redeemed by guests"
            totalLabel="Sold to hotels"
            format={formatCoinsCompact}
          />
          <p className="text-[11.5px] text-muted leading-[1.5] mt-3.5">
            Allocated but unredeemed coins sit with guests until they spend them at that hotel.
          </p>
        </Card>

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
      </div>

      {/*
        Month-wise redemptions across the network, and the control that settles
        them. Placed together so the figure being credited and the act of
        crediting it are read side by side.
      */}
      <div className="grid grid-cols-1 [@media(min-width:1100px)]:grid-cols-[2fr_1fr] gap-4 mt-4 items-start">
        <MonthlyRedemptions fetcher={monthlyRedemptions} />
        <RebateRunner onDone={run} />
      </div>
    </div>
  );
};

export default AdminDashboardPage;
