import { useCallback, useState } from "react";
import { getBill, listBills } from "../../api/hotel.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { usePaginatedList } from "../../hooks/usePaginatedList.js";
import {
  Badge,
  Empty,
  ErrorState,
  Modal,
  Pagination,
  Skeleton,
} from "../../components/common/index.jsx";
import { formatCoins, formatDateTime, formatPaise, initials, timeAgo } from "../../utils/format.js";
import styles from "./BillHistory.module.css";

/**
 * Settled bills at this hotel, with filters and a full detail view.
 *
 * Sits under the live "Awaiting payment" list: that pane answers "what is
 * outstanding right now", this one answers "what happened to a charge" — the
 * question staff get asked at the desk, usually with a guest standing there
 * disputing something.
 *
 * Its own component rather than more of BillPage, which is already a search
 * pane plus a composer. The two share only the page they sit on.
 */

const OUTLETS = ["Restaurant", "Room Service", "Spa", "Bar", "Cafe", "Laundry", "Other"];

/** The terminal states. PENDING lives in the pane above, not here. */
const HISTORY_STATUSES = ["PAID", "CANCELLED", "EXPIRED"];

const STATUS_TONE = { PAID: "ok", CANCELLED: undefined, EXPIRED: undefined, PENDING: "warn" };

/**
 * Relative date ranges, because that is how staff actually ask the question —
 * "the bill from this morning", "sometime last week". Typing two ISO dates to
 * answer that is a chore, so the common spans are one click and the custom
 * range stays available underneath.
 */
const RANGES = [
  { key: "", label: "Any time" },
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
];

const rangeToDates = (key) => {
  if (!key) return { from: "", to: "" };

  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  if (key === "today") return { from: iso(now), to: iso(now) };

  const days = key === "7d" ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: iso(start), to: iso(now) };
};

/* ------------------------------------------------------------- detail --- */

const Row = ({ label, children }) => (
  <div className={styles.row}>
    <span>{label}</span>
    <b>{children}</b>
  </div>
);

/**
 * The full record for one bill.
 *
 * Fetched on open rather than taken from the list row: the list carries what a
 * row needs, and this needs the staff member, the cancelling actor, the coin
 * split and the gateway reference. Sending all of that for every row would
 * make the list heavier for a view most rows never get.
 */
const BillDetail = ({ billId, onClose }) => {
  const { data, loading, error, run } = useAsync(
    () => (billId ? getBill(billId) : Promise.resolve(null)),
    [billId],
    /*
     * Cached per bill. A settled bill is immutable — its line items, totals
     * and timestamps cannot change again — so reopening one should be instant
     * rather than a fresh round trip and another skeleton. The key includes
     * the id, so one bill's record can never be shown under another's.
     */
    { cacheKey: "hotel.bill" }
  );

  const bill = data?.bill;

  return (
    <Modal open={Boolean(billId)} title="Bill detail" onClose={onClose}>
      {loading && (
        <div className={styles.loading}>
          <Skeleton h={18} w="45%" />
          <Skeleton h={12} w="70%" />
          <Skeleton h={90} />
          <Skeleton h={12} w="55%" />
        </div>
      )}

      {error && <ErrorState error={error} onRetry={run} />}

      {bill && (
        <div className={styles.detail}>
          <header className={styles.detailHead}>
            <span className={styles.avatar} aria-hidden="true">
              {bill.guest.avatarUrl ? (
                <img src={bill.guest.avatarUrl} alt="" />
              ) : (
                initials(bill.guest.name)
              )}
            </span>
            <div>
              <b>{bill.guest.name}</b>
              <i>
                {bill.guest.maskedEmail || "No email on file"}
                {bill.guest.memberNo ? ` · ${bill.guest.memberNo}` : ""}
              </i>
            </div>
            <Badge tone={STATUS_TONE[bill.status]}>{bill.status}</Badge>
          </header>

          {/* The itemisation, exactly as the guest saw it — a paid bill is a
              receipt, and the stored line amounts are what it must render. */}
          <table className={styles.items}>
            <tbody>
              {bill.lineItems.map((item, i) => (
                <tr key={`${item.description}-${i}`}>
                  <td>{item.description}</td>
                  <td className={styles.qty}>×{item.qty}</td>
                  <td className={styles.amt}>{formatPaise(item.amountPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.totals}>
            <Row label="Subtotal">{formatPaise(bill.subtotalPaise)}</Row>
            {bill.taxPaise > 0 && (
              <Row label={`Tax (${bill.taxPercent}%)`}>{formatPaise(bill.taxPaise)}</Row>
            )}
            <Row label="Total">{formatPaise(bill.totalPaise)}</Row>

            {/* Coins only once they were actually applied. On a cancelled or
                expired bill the guest never chose any, and showing a zero
                would imply they declined to use them. */}
            {bill.status === "PAID" && bill.coinsApplied > 0 && (
              <Row label="Paid with coins">
                −{formatCoins(bill.coinsApplied)} ({formatPaise(bill.coinsDiscountPaise)})
              </Row>
            )}

            {bill.status === "PAID" && (
              <div className={styles.grand}>
                <span>Charged</span>
                <b>{formatPaise(bill.payablePaise)}</b>
              </div>
            )}
          </div>

          {/* The commercial split, once there is money to split. */}
          {bill.status === "PAID" && bill.payablePaise > 0 && (
            <div className={styles.block}>
              <Row label={`Platform fee (${bill.platformFeePercent}%)`}>
                {formatPaise(bill.platformCommissionPaise)}
              </Row>
              <Row label="Your share">{formatPaise(bill.hotelAmountPaise)}</Row>
            </div>
          )}

          <div className={styles.block}>
            <Row label="Sent by">{bill.staffName || "—"}</Row>
            {bill.outlet && <Row label="Outlet">{bill.outlet}</Row>}
            <Row label="Created">{formatDateTime(bill.createdAt)}</Row>
            {bill.paidAt && <Row label="Paid">{formatDateTime(bill.paidAt)}</Row>}

            {/* Who voided it. "The guest declined" and "we withdrew it" are
                the same status but very different conversations. */}
            {bill.cancelledAt && (
              <Row label="Cancelled">
                {formatDateTime(bill.cancelledAt)}
                {bill.cancelledByName
                  ? ` · ${bill.cancelledByRole === "GUEST" ? "by the guest" : `by ${bill.cancelledByName}`}`
                  : ""}
              </Row>
            )}
          </div>

          {/* The gateway reference, for reconciling a disputed charge. */}
          {bill.paymentRef && (
            <div className={styles.block}>
              <Row label="Payment ref">
                <code className={styles.ref}>{bill.paymentRef}</code>
              </Row>
              {bill.isDemo && <Row label="Mode">Demo — no money moved</Row>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

/* -------------------------------------------------------------- list --- */

export const BillHistory = () => {
  const [range, setRange] = useState("");
  const [openId, setOpenId] = useState(null);

  /**
   * With no status chosen, ask for all three terminal states rather than
   * leaving it blank.
   *
   * usePaginatedList STRIPS empty filters, so a blank status would send no
   * status at all — and the endpoint would then return PENDING bills too,
   * duplicating the pane above. Defaulting here rather than in the filter
   * keeps the Select's "All settled" option genuinely empty, which is what
   * makes activeFilterCount (and so the Clear button) stay honest.
   */
  const fetchBills = useCallback(
    ({ status, ...rest }) => listBills({ ...rest, status: status || HISTORY_STATUSES }),
    []
  );

  const list = usePaginatedList(fetchBills, {
    limit: 10,
    filters: { status: "", outlet: "", from: "", to: "" },
  });

  /**
   * The preset dropdown owns from/to, so the two can never disagree.
   *
   * "custom" is the exception: it only reveals the date inputs and must leave
   * whatever range is already in force alone — clearing it there would throw
   * away the dates the moment someone chose to edit them.
   */
  const setRangePreset = (key) => {
    setRange(key);
    if (key === "custom") return;

    const { from, to } = rangeToDates(key);
    list.setFilter("from", from);
    list.setFilter("to", to);
  };

  const clearAll = () => {
    setRange("");
    list.resetFilters();
  };

  return (
    <>
      {/*
        One compact line.
        The controls are toolbar-sized rather than form-sized: the shared
        .input class is width:100% with form padding, so left alone every
        control here fought for the full width and the bar sprawled over
        three rows. `styles.control` overrides that locally rather than
        changing .input, which every real form on the panel depends on.
      */}
      <div className={styles.filters}>
        <span className={styles.searchWrap}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
            <circle cx="9" cy="9" r="5.4" stroke="currentColor" strokeWidth="1.8" />
            <path d="m13.2 13.2 3.3 3.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            className={styles.search}
            placeholder="Search guest"
            value={list.q}
            onChange={(e) => list.search(e.target.value)}
            aria-label="Search bills by guest name or email"
          />
        </span>

        {/*
          The date range as ONE control, not two date inputs.
          Two native pickers took more width than everything else combined and
          still could not express "today" without typing the date twice. The
          spans people actually ask for are a short list, so they are the
          options; "Custom" reveals the two inputs on a second row, where they
          have room to be usable.
        */}
        <select
          className={styles.control}
          value={range}
          onChange={(e) => setRangePreset(e.target.value)}
          aria-label="Date range"
        >
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
          <option value="custom">Custom range…</option>
        </select>

        <select
          className={styles.control}
          value={list.filters.status}
          onChange={(e) => list.setFilter("status", e.target.value)}
          aria-label="Status"
        >
          <option value="">All settled</option>
          {HISTORY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>

        <select
          className={styles.control}
          value={list.filters.outlet}
          onChange={(e) => list.setFilter("outlet", e.target.value)}
          aria-label="Outlet"
        >
          <option value="">All outlets</option>
          {OUTLETS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        {/* Pushed to the end so the bar has a consistent right edge whether
            or not anything is filtered. */}
        {list.activeFilterCount > 0 && (
          <button type="button" className={styles.clear} onClick={clearAll}>
            Clear
          </button>
        )}
      </div>

      {/* Only when Custom is chosen — shown always, these two would be the
          widest thing on screen for the least-used option. */}
      {range === "custom" && (
        <div className={styles.customRange}>
          <label>
            <span>From</span>
            <input
              type="date"
              className={styles.control}
              value={list.filters.from}
              max={list.filters.to || undefined}
              onChange={(e) => list.setFilter("from", e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              className={styles.control}
              value={list.filters.to}
              min={list.filters.from || undefined}
              onChange={(e) => list.setFilter("to", e.target.value)}
            />
          </label>
        </div>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.run} />
      ) : list.loading && !list.items.length ? (
        <div className={styles.loading}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={52} />
          ))}
        </div>
      ) : !list.items.length ? (
        <Empty
          title={list.activeFilterCount ? "No matching bills" : "No settled bills yet"}
          hint={
            list.activeFilterCount
              ? "Try a wider date range or clear the filters."
              : "Bills appear here once they are paid, cancelled or expired."
          }
        />
      ) : (
        <ul className={styles.list}>
          {list.items.map((bill) => (
            <li key={bill.id}>
              {/* A real button, so keyboard and screen-reader behaviour comes
                  for free rather than being hand-rolled onto a div. */}
              <button type="button" onClick={() => setOpenId(bill.id)} className={styles.rowBtn}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(bill.guestName)}
                </span>

                <span className={styles.body}>
                  <b>{bill.guestName}</b>
                  <i>
                    {bill.outlet ? `${bill.outlet} · ` : ""}
                    {timeAgo(bill.paidAt || bill.createdAt)}
                    {bill.coinsApplied > 0 ? ` · ${formatCoins(bill.coinsApplied)} coins` : ""}
                  </i>
                </span>

                <span className={styles.amount}>{formatPaise(bill.totalPaise)}</span>
                <Badge tone={STATUS_TONE[bill.status]}>{bill.status}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Pagination
        page={list.page}
        limit={list.limit}
        total={list.total}
        onPage={list.setPage}
        loading={list.loading}
      />

      <BillDetail billId={openId} onClose={() => setOpenId(null)} />
    </>
  );
};
