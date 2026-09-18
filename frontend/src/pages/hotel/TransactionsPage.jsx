import { useCallback, useMemo, useState } from "react";
import { listTransactions, getInvoice } from "../../api/hotel.api.js";
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
import { formatCoins, formatCurrency, formatDateTime, formatPaise } from "../../utils/format.js";

const TYPES = ["", "EARN", "REDEEM", "WELCOME", "ADJUSTMENT"];
/**
 * The seven original outlets, kept for the HISTORICAL filter below.
 *
 * Hotels now define their own services (see the hotel panel's Services
 * screen), but this filter runs over bills ALREADY SENT, whose outlet values
 * are exactly these seven. Fetching live services here would make a renamed or
 * deleted service hide its own history.
 */
const OUTLETS = ["Restaurant", "Room Service", "Spa", "Bar", "Cafe", "Laundry", "Other"];
const TONE = { EARN: "ok", WELCOME: "ok", REDEEM: "acc", ADJUSTMENT: undefined };

/**
 * Bill rows shown alongside the coin ledger.
 *
 * A cancelled bill and a bill paid entirely in cash move no coins, so neither
 * can be a CoinTransaction — but both are things the desk needs to look up.
 * The server returns them separately (see listBillHistory) and they are merged
 * here for display, only on the unfiltered first page: the filters above act
 * on coin-ledger fields, and a filtered view must not gain rows the filter
 * excludes.
 */
const BILL_TONE = { PAID: "ok", CANCELLED: undefined, EXPIRED: undefined };
const BILL_LABEL = { PAID: "BILL PAID", CANCELLED: "CANCELLED", EXPIRED: "EXPIRED" };

const TransactionsPage = () => {
  const list = usePaginatedList(listTransactions, {
    limit: 25,
    filters: { type: "", outlet: "", from: "", to: "" },
  });

  /**
   * The ledger plus the bills it cannot represent, newest first.
   *
   * A coin-paid bill is already a REDEEM row, so `hasLedgerRow` drops it here
   * rather than letting it appear twice. Bills are wrapped in `__bill` so one
   * renderRow can tell the two shapes apart — they share no field layout.
   */
  const rows = useMemo(() => {
    const bills = (list.data?.bills || [])
      .filter((b) => !b.hasLedgerRow)
      .map((b) => ({ _id: `bill:${b.id}`, createdAt: b.at, __bill: b }));

    if (!bills.length) return list.items;

    return [...list.items, ...bills].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }, [list.items, list.data]);

  const [invoiceId, setInvoiceId] = useState(null);

  /**
   * Bill id -> { id, number }, sent alongside the page by the server.
   *
   * Only rows that actually HAVE an invoice get an eye icon, so the column is
   * never a promise the popup cannot keep: a cancelled bill or a coin-only
   * EARN row has no invoice, and an icon there would open an error.
   */
  const invoices = list.data?.invoices || {};

  /**
   * Which invoice a row points at.
   *
   * A REDEEM row carries no bill id of its own — the ledger links the other
   * way — so its `idempotencyKey` ("bill:<id>", set when the bill was settled)
   * is the only bill reference on the row itself. The server keys the map by
   * bill id for exactly this reason.
   */
  const invoiceFor = (row) => {
    if (row.__bill) return invoices[row.__bill.id];
    const key = row.idempotencyKey || "";
    return key.startsWith("bill:") ? invoices[key.slice(5)] : undefined;
  };

  // Stable identity: InvoiceModal takes the fetcher as an effect dependency,
  // and a new function each render would refetch on every parent render.
  const fetchInvoice = useCallback((id) => getInvoice(id), []);

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
                { label: "Invoice" },
              ]}
              rows={rows}
              empty={{
                title: list.activeFilterCount ? "No matching transactions" : "No transactions yet",
                hint: list.activeFilterCount
                  ? "Try clearing the filters."
                  : "Redemptions will appear here.",
              }}
              renderRow={(row) => {
                if (row.__bill) {
                  const bill = row.__bill;
                  return (
                    <tr key={row._id}>
                      <td>
                        <b>{bill.guestName || "Guest"}</b>
                      </td>
                      <td>
                        <Badge tone={BILL_TONE[bill.status]}>
                          {BILL_LABEL[bill.status] || bill.status}
                        </Badge>
                      </td>
                      <td>{formatDateTime(bill.at)}</td>
                      <td>{bill.outlet || "—"}</td>
                      <td className="num">{formatPaise(bill.totalPaise)}</td>
                      {/* No coins moved, so a signed figure here would be
                          wrong rather than merely empty. */}
                      <td className="num">—</td>
                      <td className="num">
                        <b>{bill.status === "PAID" ? formatPaise(bill.payablePaise) : "—"}</b>
                      </td>
                      <td>
                        {invoiceFor(row) ? (
                          <InvoiceButton
                            onClick={() => setInvoiceId(invoiceFor(row).id)}
                            title={`View invoice ${invoiceFor(row).number}`}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                }

                const t = row;
                return (
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
                );
              }}
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

export default TransactionsPage;
