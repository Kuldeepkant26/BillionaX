import { listTransactions } from "../../api/hotel.api.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import {
  Badge,
  Card,
  ErrorState,
  FilterBar,
  Input,
  Pagination,
  Select,
  Table,
} from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { formatCoins, formatCurrency, formatDateTime } from "../../utils/format.js";

const TYPES = ["", "EARN", "REDEEM", "WELCOME", "ADJUSTMENT"];
const OUTLETS = ["Restaurant", "Room Service", "Spa", "Bar", "Cafe", "Laundry", "Other"];
const TONE = { EARN: "ok", WELCOME: "ok", REDEEM: "acc", ADJUSTMENT: undefined };

const TransactionsPage = () => {
  const list = usePaginatedList(listTransactions, {
    limit: 25,
    filters: { type: "", outlet: "", from: "", to: "" },
  });

  return (
    <div>
      <PageHead title="Transactions" subtitle="Every coin movement at this hotel" />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Select value={list.filters.type} onChange={(e) => list.setFilter("type", e.target.value)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t || "All types"}
            </option>
          ))}
        </Select>
        <Select
          value={list.filters.outlet}
          onChange={(e) => list.setFilter("outlet", e.target.value)}
        >
          <option value="">All outlets</option>
          {OUTLETS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          aria-label="From date"
          value={list.filters.from}
          onChange={(e) => list.setFilter("from", e.target.value)}
        />
        <Input
          type="date"
          aria-label="To date"
          value={list.filters.to}
          onChange={(e) => list.setFilter("to", e.target.value)}
        />
      </FilterBar>

      <Card>
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.run} />
        ) : (
          <>
            <Table
              loading={list.loading}
              columns={[
                { label: "Guest" },
                { label: "Type" },
                { label: "When" },
                { label: "Outlet" },
                { label: "Bill", num: true },
                { label: "Coins", num: true },
                { label: "Collected", num: true },
              ]}
              rows={list.items}
              empty={{
                title: list.activeFilterCount ? "No matching transactions" : "No transactions yet",
                hint: list.activeFilterCount
                  ? "Try clearing the filters."
                  : "Redemptions will appear here.",
              }}
              renderRow={(t) => (
                <tr key={t._id}>
                  <td>
                    <b>{t.guestId?.name || "Guest"}</b>
                  </td>
                  <td>
                    <Badge tone={TONE[t.type]}>{t.type}</Badge>
                  </td>
                  <td>{formatDateTime(t.createdAt)}</td>
                  <td>{t.outlet || "—"}</td>
                  <td className="num">{t.billAmount ? formatCurrency(t.billAmount) : "—"}</td>
                  <td className="num">
                    {t.coins > 0 ? "+" : "−"}
                    {formatCoins(Math.abs(t.coins))}
                  </td>
                  <td className="num">
                    <b>{t.cashPayable != null ? formatCurrency(t.cashPayable) : "—"}</b>
                  </td>
                </tr>
              )}
            />
            <Pagination
              page={list.page}
              limit={list.limit}
              total={list.total}
              onPage={list.setPage}
              loading={list.loading}
            />
          </>
        )}
      </Card>
    </div>
  );
};

export default TransactionsPage;
