import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getSupportThread,
  listSupportThreads,
  markSupportThreadRead,
  replyToSupportThread,
  supportUnreadCount,
} from "../../api/admin.api.js";
import { useSupportRealtime } from "../../hooks/useSupportRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { supportThreadPath, ROUTES } from "../../constants/routePaths.js";
import { Empty, ErrorState, Input, Loading } from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { initials, formatDate } from "../../utils/format.js";
import { autoGrow, timeLabel, withDayBreaks } from "../../utils/chat.js";
import styles from "./AdminSupportPage.module.css";

/**
 * The support inbox: threads on the left, the open conversation on the right.
 *
 * Two panes rather than a table that opens a modal, because answering support
 * is a queue you work THROUGH — the next thread has to be one click away, with
 * the one you just answered still visible above it. A modal would close back
 * to a list that had forgotten where you were.
 *
 * On a phone the panes stack and only one shows at a time, driven by whether
 * the URL carries a userId. That is why the open thread is a route rather
 * than component state: on a narrow screen it is genuinely a separate screen,
 * and the browser's back button should leave it.
 *
 * TWO CHANNELS share this page: guests asking about their accounts, and hotel
 * managers asking the platform team. They are separate queues with different
 * audiences, so they are tabs rather than one merged list — a hotel's billing
 * question must not be buried among guest queries. The active tab lives in
 * ?party so a link to a hotel thread opens on the right tab, and the two
 * tabs' unread counts come from the server rather than from the rows on
 * screen, which only ever cover the tab being viewed.
 */

const PARTIES = [
  { key: "GUEST", label: "Guests" },
  { key: "HOTEL", label: "Hotels" },
];

const relative = (iso) => {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const AdminSupportPage = () => {
  const { userId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toastError = useAppStore((s) => s.toastError);
  const setSupportUnread = useAppStore((s) => s.setSupportUnread);
  const nextSupportSeq = useAppStore((s) => s.nextSupportSeq);

  // Anything unrecognised falls back to the guest queue rather than showing an
  // empty inbox for a party the server would reject.
  const partyParam = searchParams.get("party");
  const party = PARTIES.some((p) => p.key === partyParam) ? partyParam : "GUEST";

  const [threads, setThreads] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [q, setQ] = useState("");
  // Per-channel unread, for the tab labels and the nav badge. From the server,
  // because the rows on screen only cover the tab being viewed.
  const [counts, setCounts] = useState({ guest: 0, hotel: 0, unread: 0 });

  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef(null);
  // Held so send() can shrink the box back after clearing the draft.
  const boxRef = useRef(null);

  /* ---- the thread list ---- */

  /**
   * Both channels' unread counts.
   *
   * Its own call rather than a sum over `threads`: the list holds one tab's
   * rows, and a search term narrows even those. Deriving the badge from them
   * would make it drop every time somebody typed in the search box.
   */
  /**
   * Writes a counts payload to both the tab labels and the rail badge.
   *
   * Every source goes through here — the initial fetch, a socket nudge, and
   * the response to marking a thread read — so the two can never disagree
   * about the same number.
   */
  const applyCounts = useCallback(
    (data, seq) => {
      if (!data) return;
      setCounts({
        guest: data.guest || 0,
        hotel: data.hotel || 0,
        unread: data.unread || 0,
      });
      // `seq` is the ticket taken before the request that produced this went
      // out. The store drops anything a newer write has superseded, so two
      // in-flight counts finishing out of order can no longer resurrect the
      // older number.
      setSupportUnread(data.unread || 0, seq);
    },
    [setSupportUnread]
  );

  const loadCounts = useCallback(async () => {
    const seq = nextSupportSeq();
    try {
      applyCounts(await supportUnreadCount(), seq);
    } catch {
      // The inbox works perfectly well without its counts.
    }
  }, [applyCounts, nextSupportSeq]);

  const loadThreads = useCallback(async (term, forParty) => {
    try {
      const data = await listSupportThreads({ limit: 50, q: term ?? "", party: forParty });
      setThreads(data?.threads || []);
      setListError(null);
    } catch (err) {
      setListError(err);
    } finally {
      setListLoading(false);
    }
  }, []);

  // Debounced so typing a name is one request, not one per keystroke. Every
  // setState inside loadThreads lands after its await, so the timer here never
  // causes a synchronous cascade. Re-runs on a tab change, which is what swaps
  // the list.
  useEffect(() => {
    setListLoading(true);
    const id = setTimeout(() => {
      loadThreads(q, party);
    }, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [q, party, loadThreads]);

  /*
   * The initial badge fetch — but ONLY when no thread is open.
   *
   * This is the race that left a read thread badged. With a thread in the URL,
   * loadThread() below also marks it read and applies the counts that write
   * returns. Both ran on mount, and this one's response could land LAST,
   * overwriting the post-read count with the pre-read one it had fetched
   * moments earlier. The count then only ever went up.
   *
   * Opening a thread makes the read authoritative, so this simply stands down
   * and lets loadThread own the number.
   */
  useEffect(() => {
    if (userId) return;
    loadCounts();
  }, [loadCounts, userId]);

  /* ---- the open conversation ---- */

  /**
   * Fetches the open conversation and returns a thunk that applies it.
   *
   * Same shape as the guest page's `load`, and for the same reason: the mount
   * effect awaits the network before touching state, rather than calling
   * setState synchronously in the effect body.
   */
  const loadThread = useCallback(async () => {
    if (!userId) return () => setThread(null);

    try {
      const data = await getSupportThread(userId, party);

      /*
       * Opening it is reading it.
       *
       * The counts come back FROM this call, recounted after the write on the
       * same connection. Firing a separate /unread-count here instead was the
       * bug that left a badge on the rail after reading a thread: two requests
       * with no ordering guarantee, and the count could be taken from a
       * snapshot predating the write.
       */
      const readSeq = nextSupportSeq();
      const read = await markSupportThreadRead(userId, party).catch(() => null);
      loadThreads(q, party);
      if (read) applyCounts(read, readSeq);
      else loadCounts();

      return () => setThread(data);
    } catch (err) {
      return () => {
        toastError(err.message || "Could not open that conversation");
        setThread(null);
      };
    }
    // q is deliberately omitted: a search term changing should not reload the
    // open conversation, only the list beside it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, party, loadThreads, loadCounts, applyCounts, nextSupportSeq, toastError]);

  /** loadThread(), applied straight away. What the socket resync uses. */
  const reloadThread = useCallback(async () => {
    const apply = await loadThread();
    apply();
  }, [loadThread]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const apply = await loadThread();
      if (!cancelled) apply();
    })();

    return () => {
      cancelled = true;
    };
  }, [loadThread]);

  /** Merges by id — a reply arrives both as the POST response and on the socket. */
  const append = useCallback((message) => {
    if (!message?.id) return;
    setThread((current) => {
      if (!current) return current;
      if (current.messages.some((m) => m.id === message.id)) return current;
      return {
        ...current,
        messages: [...current.messages, message].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        ),
      };
    });
  }, []);

  useSupportRealtime({
    onMessage: (payload) => {
      if (!payload?.message) return;

      // A message for the conversation on screen lands in it. Both ids have to
      // match: the same user id could in principle appear on either channel,
      // and a hotel message must not be appended to a guest thread.
      const forOpenThread =
        payload.userId &&
        String(payload.userId) === String(userId) &&
        (payload.party || "GUEST") === party;

      if (forOpenThread) {
        append(payload.message);

        if (payload.message.sender === "GUEST") {
          // Arriving in a thread that is already open means it has been read.
          // The counts ride back on that write for the same reason as above —
          // a separate loadCounts() here would race it and could restore the
          // badge the read just cleared.
          const readSeq = nextSupportSeq();
          markSupportThreadRead(userId, party)
            .then((read) => applyCounts(read, readSeq))
            .catch(() => loadCounts());
        } else {
          loadCounts();
        }
      } else {
        // Somebody else's thread moved. Nothing was read, so a plain recount
        // is both correct and the only option — that is what the other tab's
        // label is for.
        loadCounts();
      }

      // The list only reorders when the message belongs to the tab on screen.
      if ((payload.party || "GUEST") === party) loadThreads(q, party);
    },
    onResync: () => {
      loadThreads(q, party);
      loadCounts();
      if (userId) reloadThread();
    },
  });

  /*
   * Whether `thread` is the one the URL is asking for.
   *
   * Clicking from one conversation to the next leaves the previous guest's
   * messages in state until the new fetch lands, so rendering on `thread`
   * alone would show one guest's name above another's messages for a beat —
   * and on a support queue that is a genuine privacy slip, not a flicker.
   * Comparing ids makes the mismatch render as loading, which is what it is.
   */
  const ready =
    thread && String(thread.owner.id) === String(userId) && thread.party === party;

  const isHotelTab = party === "HOTEL";
  const countFor = (key) => (key === "HOTEL" ? counts.hotel : counts.guest);

  // The tab has to travel with the link: without ?party a hotel thread would
  // open on the guest tab, where that id owns no conversation, and 404.
  const threadHref = (id) =>
    isHotelTab ? `${supportThreadPath(id)}?party=HOTEL` : supportThreadPath(id);

  const painted = useRef(false);
  useEffect(() => {
    if (!thread?.messages?.length) return;
    endRef.current?.scrollIntoView({ behavior: painted.current ? "smooth" : "auto" });
    painted.current = true;
  }, [thread?.messages]);

  // A new conversation opens at the bottom rather than animating there, and
  // starts with an empty composer — a half-typed reply must never carry over
  // to a different guest.
  useEffect(() => {
    painted.current = false;
    setDraft("");
  }, [userId, party]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !userId) return;

    setSending(true);
    try {
      const data = await replyToSupportThread(userId, party, body);
      setDraft("");
      // The inline height from typing survives the value being cleared, so
      // without this the box stays tall and empty after sending.
      autoGrow(boxRef.current);
      if (data?.message) append(data.message);
      loadThreads(q, party);
      loadCounts();
    } catch (err) {
      toastError(err.message || "Could not send that reply");
    } finally {
      setSending(false);
    }
  };

  if (listError && !threads.length) {
    return <ErrorState error={listError} onRetry={() => loadThreads(q, party)} />;
  }

  return (
    <div>
      <PageHead
        title="Support"
        subtitle={
          isHotelTab
            ? "Questions hotel managers have sent from their panel"
            : "Questions guests have sent from the app's help centre"
        }
        actions={
          <Input
            placeholder={isHotelTab ? "Search by manager, email or hotel" : "Search by name or phone"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />

      {/* Switching tabs clears the open thread AND the search term: a term that
          matched a guest almost never matches a hotel, and carrying it over
          shows an empty queue that looks broken. */}
      <div className={styles.tabs} role="tablist">
        {PARTIES.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === party}
            className={`${styles.tab} ${p.key === party ? styles.tabOn : ""}`}
            onClick={() => {
              setQ("");
              // One navigate, not a setSearchParams as well: this has to drop
              // the :userId from the path too, and setSearchParams would keep
              // the open thread — a guest id sitting on the hotel tab.
              navigate(
                p.key === "GUEST" ? ROUTES.ADMIN_SUPPORT : `${ROUTES.ADMIN_SUPPORT}?party=${p.key}`
              );
            }}
          >
            {p.label}
            {countFor(p.key) > 0 && <b>{countFor(p.key) > 9 ? "9+" : countFor(p.key)}</b>}
          </button>
        ))}
      </div>

      {/* data-open drives the mobile single-pane behaviour — see the CSS. */}
      <div className={styles.split} data-open={userId ? "thread" : "list"}>
        <aside className={styles.list}>
          {listLoading && !threads.length && <Loading />}

          {!listLoading && !threads.length && (
            <Empty
              title={q ? "Nothing matches that" : "No questions yet"}
              hint={
                q
                  ? "Try a different name."
                  : isHotelTab
                    ? "When a hotel manager writes from their panel it appears here."
                    : "When a guest sends a message from the app it appears here."
              }
            />
          )}

          {threads.map((t) => (
            <button
              key={t.owner.id}
              type="button"
              className={`${styles.row} ${
                String(t.owner.id) === String(userId) ? styles.active : ""
              }`}
              onClick={() => navigate(threadHref(t.owner.id))}
            >
              <span className={styles.avatar}>{initials(t.owner.name || "?")}</span>
              <span className={styles.rowBody}>
                <span className={styles.rowTop}>
                  <b>{t.owner.name || (isHotelTab ? "Manager" : "Guest")}</b>
                  <time dateTime={t.lastAt}>{relative(t.lastAt)}</time>
                </span>
                {/* On the hotel tab the PROPERTY is what identifies a thread —
                    "Ravi" means nothing without it, and two properties can
                    easily share a manager's first name. */}
                {isHotelTab && t.hotel && (
                  <span className={styles.sub}>{t.hotel.name}</span>
                )}
                <span className={styles.preview}>
                  {/* Whose turn it is, at a glance: an unanswered message is
                      the only thing in this list that needs action. */}
                  {t.lastSender === "ADMIN" && <em>You: </em>}
                  {t.lastMessage}
                </span>
              </span>
              {t.unread > 0 && <span className={styles.count}>{t.unread}</span>}
            </button>
          ))}
        </aside>

        <section className={styles.pane}>
          {!userId && (
            <div className={styles.placeholder}>
              <p>Select a conversation to read and reply.</p>
            </div>
          )}

          {/* A selected thread that has not arrived, or one loaded for a
              different owner or tab. Derived rather than a flag, so it cannot
              disagree with what is on screen — and it is what stops one
              person's name appearing above another's messages. */}
          {userId && !ready && <Loading />}

          {userId && ready && (
            <>
              <header className={styles.paneHead}>
                <button
                  type="button"
                  className={styles.back}
                  // Keeps the tab: going back from a hotel thread must land on
                  // the hotel queue, not the guest one.
                  onClick={() =>
                    navigate(
                      isHotelTab ? `${ROUTES.ADMIN_SUPPORT}?party=HOTEL` : ROUTES.ADMIN_SUPPORT
                    )
                  }
                  aria-label="Back to all conversations"
                >
                  ←
                </button>
                <span className={styles.avatar}>{initials(thread.owner.name || "?")}</span>
                <div>
                  <b>
                    {thread.owner.name || (isHotelTab ? "Manager" : "Guest")}
                    {/* The property leads on a hotel thread: the reply is
                        really to the hotel, and the manager is who happens to
                        be asking today. */}
                    {isHotelTab && thread.hotel && <span> · {thread.hotel.name}</span>}
                  </b>
                  <i>
                    {/* Guests are identified by phone, staff by email — the
                        same split the User model enforces. */}
                    {isHotelTab ? thread.owner.email : thread.owner.phone}
                    {thread.owner.joinedAt && ` · joined ${formatDate(thread.owner.joinedAt)}`}
                  </i>
                </div>
              </header>

              <div className={styles.thread}>
                {!thread.messages.length && (
                  <p className={styles.state}>No messages in this conversation.</p>
                )}

                {withDayBreaks(thread.messages).map(({ message: m, day, startsDay }) => {
                  // Reversed from the guest's view: here OUR messages are the
                  // ones on the right.
                  const mine = m.sender === "ADMIN";

                  return (
                    <div key={m.id}>
                      {startsDay && <div className={styles.day}>{day}</div>}
                      <div className={`${styles.msg} ${mine ? styles.mine : styles.theirs}`}>
                        <div className={styles.bubble}>
                          <p>{m.body}</p>
                          <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div ref={endRef} />
              </div>

              <form className={styles.composer} onSubmit={send}>
                <textarea
                  ref={boxRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={`Reply to ${
                    thread.owner.name || (isHotelTab ? "this hotel" : "this guest")
                  }`}
                  // 1, not 2: the shared --composer-h in the CSS is what sets
                  // the box's height now, and a rows=2 intrinsic height would
                  // fight it and reintroduce the mismatch with the button.
                  rows={1}
                  maxLength={2000}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                  // Grows with the reply up to the CSS max-height, then
                  // scrolls. Resetting to "auto" first lets scrollHeight
                  // shrink again when text is deleted.
                  onInput={(e) => autoGrow(e.target)}
                />
                <button type="submit" disabled={!draft.trim() || sending}>
                  {sending ? "Sending…" : "Send"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminSupportPage;
