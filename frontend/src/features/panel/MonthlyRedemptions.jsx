import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Loading, Table } from "../../components/common/index.jsx";
import { useAsync } from "../../hooks/useAsync.js";
import { formatCoins, formatCurrency } from "../../utils/format.js";

/**
 * Coins redeemed month by month, with the rebate credited against each.
 *
 * Shared by the admin and hotel dashboards — they differ only in which fetcher
 * they pass, so scoping stays a server concern: the hotel endpoint derives its
 * own hotelId from the session and ignores any the client might send.
 */

const PRESETS = [
  { label: "6 months", months: 6 },
  { label: "12 months", months: 12 },
  { label: "24 months", months: 24 },
];

/** "2026-08" -> "Aug 2026". Parsed as parts, never as a Date string. */
const monthLabel = (key) => {
  const [year, month] = key.split("-").map(Number);
  return `${new Date(year, month - 1, 1).toLocaleString("en-IN", { month: "short" })} ${year}`;
};

const MonthlyRedemptions = ({ fetcher, title = "Coins redeemed by month" }) => {
  const [months, setMonths] = useState(12);
  // Custom range. Empty strings mean "use the preset instead".
  const [range, setRange] = useState({ from: "", to: "" });
  const custom = Boolean(range.from && range.to);

  // Only one of the two reaches the API: sending both would let a stale preset
  // silently narrow an explicit range. useAsync re-runs whenever these change,
  // and drops a slow earlier response that lands after a newer one.
  const { data, error, loading } = useAsync(
    () => fetcher(custom ? { from: range.from, to: range.to } : { months }),
    [custom, range.from, range.to, months]
  );

  const columns = useMemo(
    () => [
      { key: "month", label: "Month" },
      { key: "redeemed", label: "Coins redeemed", num: true },
      { key: "bills", label: "Bills", num: true },
      { key: "revenue", label: "Cash collected", num: true },
      { key: "credited", label: "Rebate credited", num: true },
      { key: "status", label: "Status" },
    ],
    []
  );

  const rows = data?.series ?? [];

  return (
    <Card
      title={title}
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.months}
              size="sm"
              variant={!custom && months === p.months ? "primary" : "ghost"}
              onClick={() => {
                setRange({ from: "", to: "" });
                setMonths(p.months);
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      }
    >
      {/* A range only takes effect once BOTH ends are set, so a half-filled
          filter never silently narrows the report. */}
      <div className="flex flex-wrap items-start gap-3 mb-1">
        <div className="min-w-[150px]">
          <Field label="From">
            <Input
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </Field>
        </div>
        <div className="min-w-[150px]">
          <Field label="To">
            <Input
              type="date"
              value={range.to}
              min={range.from || undefined}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </Field>
        </div>

        {custom && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-[22px]"
            onClick={() => setRange({ from: "", to: "" })}
          >
            Clear range
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-[color-mix(in_srgb,var(--bad)_12%,transparent)] border-l-[3px] border-l-[var(--bad)] rounded-token-sm px-3 py-2.5 text-[12.5px] text-[var(--bad)] mb-3.5">
          {error.message || "Could not load the report"}
        </div>
      )}

      {loading && !data ? (
        <Loading />
      ) : (
        <>
          <Table
            columns={columns}
            rows={rows}
            loading={loading}
            empty={{
              title: "No redemptions in this range",
              hint: "Coins guests spend at the hotel will appear here month by month.",
            }}
            renderRow={(m) => (
              <tr key={m.month}>
                <td>{monthLabel(m.month)}</td>
                <td className="num">{formatCoins(m.coinsRedeemed)}</td>
                <td className="num">{formatCoins(m.bills)}</td>
                <td className="num">{formatCurrency(m.revenue)}</td>
                <td className="num">
                  {m.coinsCredited ? formatCoins(m.coinsCredited) : "—"}
                </td>
                <td>
                  {m.settled ? (
                    <Badge tone="ok">Settled · {m.ratePercent}%</Badge>
                  ) : m.coinsRedeemed ? (
                    <Badge tone="warn">Pending</Badge>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
              </tr>
            )}
          />

          {rows.length > 0 && (
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 mt-3.5 pt-3 border-t border-[var(--line)] text-[12.5px]">
              <span className="text-muted">
                Redeemed <b className="text-ink">{formatCoins(data.totals.coinsRedeemed)}</b>
              </span>
              <span className="text-muted">
                Bills <b className="text-ink">{formatCoins(data.totals.bills)}</b>
              </span>
              <span className="text-muted">
                Cash <b className="text-ink">{formatCurrency(data.totals.revenue)}</b>
              </span>
              <span className="text-muted">
                Rebate credited <b className="text-ink">{formatCoins(data.totals.coinsCredited)}</b>
              </span>
            </div>
          )}
        </>
      )}
    </Card>
  );
};

export default MonthlyRedemptions;
