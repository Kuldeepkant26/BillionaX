/**
 * Laying the feeds that ride along with the coin ledger over it.
 *
 * The Transactions tables page through the coin ledger, and two kinds of row
 * that cannot BE ledger rows are sent beside it for display: bills that moved
 * no coins, and coin purchases — a hotel buying inventory from the platform,
 * which has no guest and no membership balance to move. The server decides
 * which of them belong on the page in hand; this only interleaves them.
 *
 * Shared by the hotel and admin tables so the two cannot sort differently,
 * and kept free of JSX so tests/transactionFeed.test.js can import it.
 */

/**
 * Coin purchases as table rows.
 *
 * Wrapped in `__purchase` the way bill rows are wrapped in `__bill`: the three
 * shapes share no field layout, and one renderRow has to tell them apart. The
 * `purchase:` prefix keeps the React key clear of ledger and bill ids.
 */
export const purchaseRows = (purchases) =>
  (purchases || []).map((purchase) => ({
    _id: `purchase:${purchase.id}`,
    createdAt: purchase.at,
    __purchase: purchase,
  }));

/**
 * The ledger rows plus whatever rides along, newest first.
 *
 * Every feed's rows carry `createdAt` set to the moment the row should sort
 * on — for a bill that is when it was paid or cancelled, not composed.
 *
 * With nothing riding along the ledger comes back untouched, the SAME array:
 * a page with no extra rows must not re-sort (or re-render) for nothing.
 */
export const mergeFeeds = (ledger, ...feeds) => {
  const extra = feeds.flat();
  if (!extra.length) return ledger;

  return [...ledger, ...extra].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};
