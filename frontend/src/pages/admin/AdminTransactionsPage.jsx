import { useCallback, useState } from "react";
import { listTransactions, listHotels, getInvoice } from "../../api/admin.api.js";
import { useAsync } from "../../hooks/useAsync.js";
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
import { InvoiceButton, InvoiceModal } from "../../features/panel/InvoiceModal.jsx";
import { formatCoins, formatCurrency, formatDateTime } from "../../utils/format.js";

const TYPES = ["", "EARN", "REDEEM", "WELCOME", "ADJUSTMENT"];
const TONE = { EARN: "ok", WELCOME: "ok", REDEEM: "acc" };

const AdminTransactionsPage = () => {
  const list = usePaginatedList(listTransactions, {
    limit: 25,
    filters: { type: "", hotelId: "", from: "", to: "" },
  });

  // The hotel cross-filter is what turns a flat network-wide dump into an
  // actual investigation tool.
  const { data: hotelData } = useAsync(() => listHotels({ limit: 100 }), []);
  const hotels = hotelData?.items || [];

  const [invoiceId, setInvoiceId] = useState(null);

  /**
   * Bill id -> { id, number }, sent with the page. Only rows that HAVE an
   * invoice get an eye icon, so the column never opens an error — a WELCOME or
   * EARN row has no bill behind it and no invoice to show.
   *
   * A REDEEM row carries no billId column, so the id comes off its
   * `idempotencyKey` ("bill:<id>"); the server keys the map to match.
   */
  const invoices = list.data?.invoices || {};
  const invoiceFor = (t) => {
    const key = t.idempotencyKey || "";
    return key.startsWith("bill:") ? invoices[key.slice(5)] : undefined;
  };

  // Stable identity: InvoiceModal takes this as an effect dependency.
  const fetchInvoice = useCallback((id) => getInvoice(id), []);

  return (
    <div>
      <PageHead title="Transactions" subtitle="Every coin movement across the network" />

      <FilterBar activeCount={list.activeFilterCount} onClear={list.resetFilters}>
        <Select
          value={list.filters.hotelId}
          onChange={(e) => list.setFilter("hotelId", e.target.value)}
        >
          <option value="">All hotels</option>
          {hotels.map((h) => (
            <option key={h._id} value={h._id}>
              {h.name}
            </option>
          ))}
        </Select>
        <Select value={list.filters.type} onChange={(e) => list.setFilter("type", e.target.value)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t || "All types"}
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
                { label: "Hotel" },
                { label: "Guest" },
                { label: "Type" },
                { label: "When" },
                { label: "Bill", num: true },
                { label: "Coins", num: true },
                { label: "Fee", num: true },
                { label: "Invoice" },
              ]}
              rows={list.items}
              empty={{
                title: list.activeFilterCount ? "No matching transactions" : "No transactions yet",
                hint: list.activeFilterCount ? "Try clearing the filters." : undefined,
              }}
              renderRow={(t) => (
                <tr key={t._id}>
                  <td>
                    <b>{t.hotelId?.name || "—"}</b>
                  </td>
                  <td>{t.guestId?.name || "Guest"}</td>
                  <td>
                    <Badge tone={TONE[t.type]}>{t.type}</Badge>
                  </td>
                  <td>{formatDateTime(t.createdAt)}</td>
                  <td className="num">{t.billAmount ? formatCurrency(t.billAmount) : "—"}</td>
                  <td className="num">
                    {t.coins > 0 ? "+" : "−"}
                    {formatCoins(Math.abs(t.coins))}
                  </td>
                  <td className="num">
                    <b>{t.platformFee != null ? formatCurrency(t.platformFee) : "—"}</b>
                  </td>
                  <td>
                    {invoiceFor(t) ? (
                      <InvoiceButton
                        onClick={() => setInvoiceId(invoiceFor(t).id)}
                        title={`View invoice ${invoiceFor(t).number}`}
                      />
                    ) : (
                      "—"
                    )}
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

      <InvoiceModal
        invoiceId={invoiceId}
        onClose={() => setInvoiceId(null)}
        fetchInvoice={fetchInvoice}
      />
    </div>
  );
};

export default AdminTransactionsPage;
