import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  listSupportMessages,
  markSupportRead,
  sendSupportMessage,
} from "../../api/guest.api.js";
import { useSupportRealtime } from "../../hooks/useSupportRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { ErrorState } from "../../components/common/index.jsx";
import { autoGrow, timeLabel, withDayBreaks } from "../../utils/chat.js";
import styles from "./SupportChatPage.module.css";

/**
 * The guest's conversation with support.
 *
 * State is local rather than in useAsync, because a chat is append-only and
 * arrives from three directions — the initial load, the socket, and the
 * guest's own send. A cached hook would have each of those fighting over the
 * same `data`, and a background revalidation could drop a message the socket
 * had just appended. A plain array with one merge function (`append`, below)
 * is both shorter and correct.
 *
 * There is no pagination, matching the server: a support thread is read whole,
 * oldest first, and a "load earlier" control would hide the START of a
 * conversation that is rarely longer than a screen or two.
 */

const SupportChatPage = () => {
  const navigate = useNavigate();
  const clearSupportUnread = useAppStore((s) => s.clearSupportUnread);
  const toastError = useAppStore((s) => s.toastError);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef(null);
  // Held so send() can shrink the box back after clearing the draft.
  const boxRef = useRef(null);
  const listRef = useRef(null);

  /**
   * Merges a message in by id.
   *
   * Every path into the thread goes through here, because the guest's own
   * message arrives TWICE: once as the POST response, and again on the socket
   * echo that keeps a second device in step. Keying by id makes the second
   * arrival a no-op instead of a duplicate bubble.
   */
  const append = useCallback((incoming) => {
    if (!incoming?.id) return;
    setMessages((current) => {
      if (current.some((m) => m.id === incoming.id)) return current;
      return [...current, incoming].sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
    });
  }, []);

  /**
   * Fetches the thread and returns a thunk that applies it.
   *
   * The indirection is what keeps the mount effect free of a synchronous
   * setState: the caller awaits the network first, then applies. Callers that
   * do not care (the socket resync) simply invoke the thunk immediately.
   */
  const load = useCallback(async () => {
    try {
      const data = await listSupportMessages();
      return () => {
        setMessages(data?.messages || []);
        setError(null);
        setLoading(false);
      };
    } catch (err) {
      return () => {
        setError(err);
        setLoading(false);
      };
    }
  }, []);

  /** load(), applied straight away. What the retry button and socket use. */
  const reload = useCallback(async () => {
    const apply = await load();
    apply();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    // Wrapped so every setState lands after an await rather than synchronously
    // in the effect body — the cascading-render pattern the rules of hooks
    // reject. The cancelled flag drops a response that arrives after unmount.
    (async () => {
      const result = await load();
      if (!cancelled && result) result();
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  /*
   * Opening the thread IS reading it.
   *
   * Fired once on mount rather than per message: the whole conversation is on
   * screen, so there is nothing partial to mark. The store is cleared
   * optimistically so the dot in the bottom nav disappears on the tap that
   * brought the guest here, not a round trip later.
   */
  useEffect(() => {
    clearSupportUnread();
    markSupportRead().catch(() => {
      // The badge is already clear locally and the next open re-marks it;
      // failing loudly here would be noise about a cosmetic count.
    });
  }, [clearSupportUnread]);

  useSupportRealtime({
    onMessage: (payload) => {
      if (!payload?.message) return;
      append(payload.message);
      // An admin reply that lands while the thread is OPEN has already been
      // read, so clear the badge the push just raised rather than leaving a
      // dot on a conversation the guest is looking at.
      if (payload.message.sender === "ADMIN") {
        clearSupportUnread();
        markSupportRead().catch(() => {});
      }
    },
    onResync: reload,
  });

  // Pinned to the newest message, which is where a chat belongs. `auto` on the
  // first paint so the thread opens already at the bottom instead of visibly
  // scrolling there; smooth afterwards, when it is a new message arriving.
  const painted = useRef(false);
  useEffect(() => {
    if (!messages.length) return;
    endRef.current?.scrollIntoView({ behavior: painted.current ? "smooth" : "auto" });
    painted.current = true;
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    try {
      const data = await sendSupportMessage(body);
      // Cleared only after the server has it: a failed send that had already
      // emptied the box would lose what the guest typed.
      setDraft("");
      // The inline height from typing survives the value being cleared, so
      // without this the box stays tall and empty after sending.
      autoGrow(boxRef.current);
      if (data?.message) append(data.message);
    } catch (err) {
      toastError(err.message || "Could not send that. Try again.");
    } finally {
      setSending(false);
    }
  };

  if (error && !messages.length) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button
          type="button"
          className={styles.back}
          onClick={() => navigate(ROUTES.APP_HELP)}
          aria-label="Back to help centre"
        >
          ←
        </button>
        <div>
          <h1>Billionax support</h1>
          <p>We usually reply within a day.</p>
        </div>
      </header>

      <div className={styles.thread} ref={listRef}>
        {loading && <p className={styles.state}>Loading your messages…</p>}

        {!loading && !messages.length && (
          <div className={styles.empty}>
            <b>No messages yet</b>
            <i>
              Ask us anything about your account, a bill or your coins. A real person reads
              every message.
            </i>
          </div>
        )}

        {withDayBreaks(messages).map(({ message: m, day, startsDay }) => {
          const mine = m.sender === "GUEST";

          return (
            <div key={m.id}>
              {startsDay && <div className={styles.day}>{day}</div>}
              <div className={`${styles.row} ${mine ? styles.mine : styles.theirs}`}>
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
          placeholder="Type your message"
          rows={1}
          maxLength={2000}
          // Enter sends, Shift+Enter breaks the line — the convention every
          // messaging app on this guest's phone already uses.
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e);
            }
          }}
          // Grows with the text up to the CSS max-height, then scrolls.
          onInput={(e) => autoGrow(e.target)}
        />
        <button type="submit" disabled={!draft.trim() || sending} aria-label="Send">
          <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
            <path d="M3 17l15-7L3 3l3.2 7L3 17z" fill="currentColor" />
          </svg>
        </button>
      </form>
    </div>
  );
};

export default SupportChatPage;
