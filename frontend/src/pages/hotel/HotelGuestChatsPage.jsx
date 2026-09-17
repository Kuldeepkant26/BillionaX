import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getGuestThread,
  listGuestThreads,
  markGuestThreadRead,
  replyToGuestThread,
} from "../../api/hotel.api.js";
import { useSupportRealtime } from "../../hooks/useSupportRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { hotelGuestChatPath, ROUTES } from "../../constants/routePaths.js";
import { Empty, ErrorState, Input, Loading } from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { initials, formatDate } from "../../utils/format.js";
import { autoGrow, timeLabel, withDayBreaks } from "../../utils/chat.js";
// The admin inbox's stylesheet, not a copy.
//
// This is the same object — a two-pane queue that collapses to one pane on a
// phone — and that CSS carries the mobile single-pane behaviour and the
// composer height arithmetic. Duplicating it would mean two files drifting
// apart over a layout that has to stay identical.
import styles from "../admin/AdminSupportPage.module.css";

/**
 * The property's queue of guest conversations.
 *
 * The mirror of AdminSupportPage, minus its tabs: that page works two channels
 * and needs to say which; this one has exactly one queue — the guests of this
 * hotel — so a tab strip would be a control with a single option.
 *
 * Reachable by HOTEL_STAFF as well as managers, unlike the panel's own support
 * thread. A guest asking about their room is the front desk's question to
 * answer, and making them wait for a manager to relay it is the delay this
 * channel exists to remove.
 *
 * The property is never in the URL or in a request body — it comes from the
 * token on every call. The only id a client supplies here is the guest's, and
 * the server checks their membership before returning a word of it.
 */

const relative = (iso) => {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)}d`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const HotelGuestChatsPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toastError = useAppStore((s) => s.toastError);
  // The rail's count, written from the reads below so the badge clears on the
  // same response that cleared the rows — never from a second request that
  // would race it.
  const setGuestChatsUnread = useAppStore((s) => s.setGuestChatsUnread);

  const [threads, setThreads] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [q, setQ] = useState("");

  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef(null);
  // Held so send() can shrink the box back after clearing the draft.
  const boxRef = useRef(null);

  /* ---- the thread list ---- */

  const loadThreads = useCallback(async (term) => {
    try {
      const data = await listGuestThreads({ limit: 50, q: term ?? "" });
      setThreads(data?.threads || []);
      setListError(null);
    } catch (err) {
      setListError(err);
    } finally {
      setListLoading(false);
    }
  }, []);

  // Debounced so typing a name is one request, not one per keystroke. Every
  // setState inside loadThreads lands after its await, so the timer never
  // causes a synchronous cascade.
  useEffect(() => {
    setListLoading(true);
    const id = setTimeout(() => {
      loadThreads(q);
    }, q ? 300 : 0);
    return () => clearTimeout(id);
  }, [q, loadThreads]);

  /* ---- the open conversation ---- */

  /**
   * Fetches the open conversation and returns a thunk that applies it.
   *
   * The same shape as every other chat loader here: the effect awaits the
   * network before touching state rather than calling setState synchronously
   * in its body.
   */
  const loadThread = useCallback(async () => {
    if (!userId) return () => setThread(null);

    try {
      const data = await getGuestThread(userId);

      /*
       * Opening it is reading it.
       *
       * The badge comes back FROM this write, recounted afterwards on the same
       * connection — the same reason markReadByPlatform returns its counts. A
       * separate unread-count call here would race the write and could restore
       * the badge the read just cleared.
       */
      const read = await markGuestThreadRead(userId).catch(() => null);
      loadThreads(q);
      if (read && typeof read.unread === "number") setGuestChatsUnread(read.unread);

      return () => setThread(data);
    } catch (err) {
      return () => {
        toastError(err.message || "Could not open that conversation");
        setThread(null);
      };
    }
    // q is deliberately omitted: a search term changing should reload the list
    // beside the conversation, not the conversation itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadThreads, toastError]);

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
    // This panel account also has its OWN thread with the platform, delivered
    // over the same event. Without this filter a reply from Billionax would
    // append itself to whichever guest conversation happened to be open.
    party: "HOTEL_GUEST",
    onMessage: (payload) => {
      if (!payload?.message) return;

      if (payload.userId && String(payload.userId) === String(userId)) {
        append(payload.message);

        // A guest message arriving in a thread already on screen has been
        // read. The badge rides back on that write rather than a second call.
        if (payload.message.sender === "GUEST") {
          markGuestThreadRead(userId)
            .then((read) => {
              if (read && typeof read.unread === "number") setGuestChatsUnread(read.unread);
            })
            .catch(() => {});
        }
      }

      // Another guest's thread moved: the list reorders, and its own row
      // carries the unread count.
      loadThreads(q);
    },
    onResync: () => {
      loadThreads(q);
      if (userId) reloadThread();
    },
  });

  /*
   * Whether `thread` is the one the URL is asking for.
   *
   * Clicking from one conversation to the next leaves the previous guest's
   * messages in state until the new fetch lands, so rendering on `thread`
   * alone would show one guest's name above another's messages for a beat —
   * on a queue of private conversations that is a real disclosure, not a
   * flicker. Comparing ids renders the mismatch as loading, which is what it
   * is.
   */
  const ready = thread && String(thread.owner.id) === String(userId);

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
  }, [userId]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || !userId) return;

    setSending(true);
    try {
      const data = await replyToGuestThread(userId, body);
      setDraft("");
      // The inline height from typing survives the value being cleared, so
      // without this the box stays tall and empty after sending.
      autoGrow(boxRef.current);
      if (data?.message) append(data.message);
      loadThreads(q);
    } catch (err) {
      toastError(err.message || "Could not send that reply");
    } finally {
      setSending(false);
    }
  };

  if (listError && !threads.length) {
    return <ErrorState error={listError} onRetry={() => loadThreads(q)} />;
  }

  return (
    <div>
      <PageHead
        title="Guest messages"
        subtitle="Questions your guests have sent from the app's help centre"
        actions={
          <Input
            placeholder="Search by name or phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />

      {/* data-open drives the mobile single-pane behaviour — see the CSS. */}
      <div className={styles.split} data-open={userId ? "thread" : "list"}>
        <aside className={styles.list}>
          {listLoading && !threads.length && <Loading />}

          {!listLoading && !threads.length && (
            <Empty
              title={q ? "Nothing matches that" : "No messages yet"}
              hint={
                q
                  ? "Try a different name."
                  : "When a guest messages you from the app it appears here."
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
              onClick={() => navigate(hotelGuestChatPath(t.owner.id))}
            >
              <span className={styles.avatar}>{initials(t.owner.name || "?")}</span>
              <span className={styles.rowBody}>
                <span className={styles.rowTop}>
                  <b>{t.owner.name || "Guest"}</b>
                  <time dateTime={t.lastAt}>{relative(t.lastAt)}</time>
                </span>
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

          {/* A selected thread that has not arrived, or one loaded for another
              guest. Derived rather than a flag, so it cannot disagree with
              what is on screen. */}
          {userId && !ready && <Loading />}

          {userId && ready && (
            <>
              <header className={styles.paneHead}>
                <button
                  type="button"
                  className={styles.back}
                  onClick={() => navigate(ROUTES.HOTEL_GUEST_CHATS)}
                  aria-label="Back to all conversations"
                >
                  ←
                </button>
                <span className={styles.avatar}>{initials(thread.owner.name || "?")}</span>
                <div>
                  <b>
                    {thread.owner.name || "Guest"}
                    {/* The tier is the one thing about a guest that changes how
                        a request is usually answered, so it sits in the
                        header rather than a click away. */}
                    {thread.owner.tier && <span> · {thread.owner.tier}</span>}
                  </b>
                  <i>
                    {thread.owner.phone}
                    {thread.owner.joinedAt && ` · joined ${formatDate(thread.owner.joinedAt)}`}
                  </i>
                </div>
              </header>

              <div className={styles.thread}>
                {!thread.messages.length && (
                  <p className={styles.state}>No messages in this conversation.</p>
                )}

                {withDayBreaks(thread.messages).map(({ message: m, day, startsDay }) => {
                  // ADMIN is the side that ANSWERS, which on this channel is
                  // this hotel — so these are our messages, on the right.
                  const mine = m.sender === "ADMIN";

                  return (
                    <div key={m.id}>
                      {startsDay && <div className={styles.day}>{day}</div>}
                      <div className={`${styles.msg} ${mine ? styles.mine : styles.theirs}`}>
                        <div className={styles.bubble}>
                          <p>{m.body}</p>
                          <time dateTime={m.createdAt}>
                            {/* Who at the desk replied. Several people share
                                this queue, so "Ravi" tells the next person on
                                shift that it is already handled. The guest is
                                never shown this — they see the property. */}
                            {mine && m.authorName ? `${m.authorName} · ` : ""}
                            {timeLabel(m.createdAt)}
                          </time>
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
                  placeholder={`Reply to ${thread.owner.name || "this guest"}`}
                  rows={1}
                  maxLength={2000}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
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

export default HotelGuestChatsPage;
