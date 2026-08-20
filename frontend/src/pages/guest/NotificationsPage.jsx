/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { listNotifications, markNotificationsRead } from "../../api/notification.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Button, Empty, ErrorState } from "../../components/common/index.jsx";
import { ListSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins, formatDateTime } from "../../utils/format.js";
import styles from "./NotificationsPage.module.css";

const PAGE_SIZE = 50;

/** Icon glyph per feed item, keyed by ledger type or notice kind. */
const GLYPH = {
  WELCOME: "★",
  EARN: "+",
  REDEEM: "−",
  ADJUSTMENT: "+",
  TIER_UP: "▲",
  HOTEL_JOINED: "★",
  VOUCHER_ISSUED: "◆",
  VOUCHER_EXPIRING: "!",
  VOUCHER_CANCELLED: "×",
  SYSTEM: "•",
};

const NotificationsPage = () => {
  const setUnread = useAppStore((s) => s.setUnread);
  const unread = useAppStore((s) => s.unread);
  const feedRevision = useAppStore((s) => s.feedRevision);
  const lastPushed = useAppStore((s) => s.lastPushed);

  const [olderPages, setOlderPages] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, loading, error, run, setData } = useAsync(
    () => listNotifications({ limit: PAGE_SIZE }),
    []
  );

  // A push that lands while this page is already open must appear without a
  // reload. Two steps, because the socket payload arrives before any refetch
  // could finish: prepend the pushed item straight away, then reconcile with
  // the server so ordering and read-state stay authoritative.
  //
  // Only page 1 is refetched — older pages already loaded stay put, since a
  // new item can only ever arrive at the top.
  useEffect(() => {
    if (!feedRevision) return;

    if (lastPushed) {
      setData((current) => {
        if (!current) return current;
        const items = current.items || [];
        // The refetch below may have already delivered it.
        if (items.some((i) => i.id === lastPushed.id)) return current;
        return { ...current, items: [{ ...lastPushed, read: false }, ...items] };
      });
    }

    run().catch(() => {
      // The optimistic row above is already on screen; a failed refetch just
      // means ordering is corrected on the next open.
    });
  }, [feedRevision]);

  const loadOlder = async () => {
    setLoadingMore(true);
    try {
      const next = await listNotifications({ limit: PAGE_SIZE, page: olderPages.length + 2 });
      setOlderPages((pages) => [...pages, next]);
    } catch {
      // Leave what is already on screen; the button stays available to retry.
    } finally {
      setLoadingMore(false);
    }
  };

  // Opening the feed IS reading it — the bell is "open it and everything is
  // read", so there is no per-item read affordance to maintain. This also
  // re-runs per push, so arriving items do not leave a stale badge behind.
  useEffect(() => {
    if (loading || error) return;
    markNotificationsRead()
      .then(() => setUnread(0))
      .catch(() => {});
  }, [loading, error, feedRevision]);

  // Only block on the very first load — a refetch triggered by a push must not
  // replace the list the guest is reading with a spinner.
  if (loading && !data) return <ListSkeleton label="Loading your alerts" />;
  if (error && !data) return <ErrorState error={error} onRetry={run} />;

  // Page 1 plus any older pages the guest has pulled in, de-duplicated: a push
  // can shift an item across the page boundary between two fetches.
  const seen = new Set();
  const items = [data, ...olderPages]
    .flatMap((page) => page?.items || [])
    .filter((item) => !seen.has(item.id) && seen.add(item.id));

  const hasMore = (olderPages[olderPages.length - 1] ?? data)?.hasMore;

  return (
    <div>
      <header className={styles.head}>
        <h1 className={`display ${styles.title}`}>Alerts</h1>
        {unread > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => markNotificationsRead().then(() => setUnread(0))}
          >
            Mark all read
          </Button>
        )}
      </header>
      <p className={styles.sub}>Coins you have earned and spent, across every hotel</p>

      {!items.length ? (
        <Empty
          title="Nothing yet"
          hint="Coins you earn and spend will show up here as it happens."
        />
      ) : (
        <div className={styles.list}>
          {items.map((n) => {
            const positive = n.coins > 0;
            return (
              <div key={n.id} className={`${styles.row} ${n.read ? "" : styles.fresh}`}>
                <span
                  className={`${styles.icon} ${
                    n.coins == null ? styles.notice : positive ? styles.plus : styles.minus
                  }`}
                >
                  {GLYPH[n.kind] || "•"}
                </span>

                <span className={styles.meta}>
                  <b>{n.title}</b>
                  <i>{n.body}</i>
                  <u>
                    {formatDateTime(n.createdAt)}
                    {n.hotel?.name ? ` · ${n.hotel.name}` : ""}
                  </u>
                </span>

                {n.coins != null && (
                  <span className={`${styles.amount} ${positive ? styles.up : ""}`}>
                    {positive ? "+" : "−"}
                    {formatCoins(Math.abs(n.coins))}
                  </span>
                )}
              </div>
            );
          })}

          {/* Without this the feed silently stops at the first page and older
              activity is unreachable, even though the API reports hasMore. */}
          {hasMore && (
            <Button
              variant="ghost"
              block
              className={styles.more}
              onClick={loadOlder}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load older activity"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
