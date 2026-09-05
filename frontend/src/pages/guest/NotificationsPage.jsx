/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { listNotifications, markNotificationsRead } from "../../api/notification.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { Button, Empty, ErrorState } from "../../components/common/index.jsx";
import { ListSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins, formatDateTime } from "../../utils/format.js";

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
    [],
    // setData writes through to the cache, so marking one read stays read
    // after navigating away and back.
    { cacheKey: "guest.notifications" }
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
      <header className="flex items-center justify-between gap-3">
        <h1 className="display text-[22px]">Alerts</h1>
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
      <p className="text-muted text-[12.5px] mt-[5px] mb-[18px]">
        Coins you have earned and spent, across every hotel
      </p>

      {!items.length ? (
        <Empty
          title="Nothing yet"
          hint="Coins you earn and spend will show up here as it happens."
        />
      ) : (
        <div className="flex flex-col">
          {items.map((n) => {
            const positive = n.coins > 0;
            return (
              <div
                key={n.id}
                className={`flex items-start gap-[11px] py-[13px] pr-2.5 border-b border-hairline last:border-b-0 rounded-token-sm ${
                  // Unread rows carry a tinted ground and an accent rule, so the
                  // ones that arrived since the last visit are obvious without
                  // a per-row badge.
                  n.read
                    ? "pl-0"
                    : "pl-2.5 bg-[var(--soft)] shadow-[inset_2px_0_0_var(--acc)]"
                }`}
              >
                <span
                  className={`w-[34px] h-[34px] rounded-[11px] grid place-items-center text-[15px] font-bold flex-none ${
                    n.coins == null
                      ? "bg-chip text-[var(--acc2)]"
                      : positive
                        ? "bg-[var(--soft)] text-accent"
                        : "bg-chip text-muted"
                  }`}
                >
                  {GLYPH[n.kind] || "•"}
                </span>

                <span className="flex-1 min-w-0 leading-[1.4]">
                  <b className="block text-[12.5px] font-semibold">{n.title}</b>
                  <i className="block not-italic text-[11.5px] text-ink opacity-75 mt-px">{n.body}</i>
                  <u className="block no-underline text-[10.5px] text-muted mt-[3px]">
                    {formatDateTime(n.createdAt)}
                    {n.hotel?.name ? ` · ${n.hotel.name}` : ""}
                  </u>
                </span>

                {n.coins != null && (
                  <span
                    className={`text-[13px] font-semibold whitespace-nowrap tabular-nums ${
                      positive ? "text-accent" : ""
                    }`}
                  >
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
              className="mt-3.5"
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
