import { useCallback, useEffect, useRef, useState } from "react";
import {
  listSupportMessages,
  markSupportRead,
  sendSupportMessage,
} from "../../api/hotel.api.js";
import { useSupportRealtime } from "../../hooks/useSupportRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ErrorState, Loading } from "../../components/common/index.jsx";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { autoGrow, timeLabel, withDayBreaks } from "../../utils/chat.js";
import styles from "./HotelSupportPage.module.css";

/**
 * This manager's conversation with the Billionax platform team.
 *
 * One thread per ACCOUNT, not per property — two managers at the same hotel
 * have separate conversations, and nothing a colleague asked reaches this
 * screen. The server enforces that by pushing to the author's OWN room rather
 * than to the hotel room their colleagues also sit in (see support.service.js);
 * the id check below is a second line rather than the boundary itself.
 *
 * Same local-state shape as the guest's SupportChatPage and for the same
 * reasons — a chat is append-only and arrives from three directions, so one
 * merge function beats a cache that could drop a socket message during a
 * background revalidation.
 */

const HotelSupportPage = () => {
  const toastError = useAppStore((s) => s.toastError);
  const clearSupportUnread = useAppStore((s) => s.clearSupportUnread);
  const myId = useAppStore((s) => s.user?.id);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef(null);
  // Held so send() can shrink the box back after clearing the draft.
  const boxRef = useRef(null);

  /** Merges by id — a message arrives as the POST response AND on the socket. */
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
   * The indirection keeps the mount effect free of a synchronous setState —
   * the cascading-render pattern this repo's lint rejects. Same shape as the
   * guest page's loader.
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

  /** load(), applied straight away. What retry and the socket resync use. */
  const reload = useCallback(async () => {
    const apply = await load();
    apply();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const apply = await load();
      if (!cancelled) apply();
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  // Opening the page IS reading it — the whole conversation is on screen, so
  // there is nothing partial to mark.
  useEffect(() => {
    clearSupportUnread();
    markSupportRead().catch(() => {
      // The badge is already clear locally and the next open re-marks it.
    });
  }, [clearSupportUnread]);

  useSupportRealtime({
    // The PLATFORM thread, not the property's guest queue — which is now
    // delivered to this same account over the hotel room. Without this the
    // desk's guest conversations would paint themselves into this screen.
    party: "HOTEL",
    onMessage: (payload) => {
      if (!payload?.message) return;
      // Belt and braces: the server already delivers only this account's own
      // thread. This costs nothing and means a future change to the delivery
      // room cannot silently paint someone else's messages into this thread.
      if (payload.userId && myId && String(payload.userId) !== String(myId)) return;

      append(payload.message);

      // A reply landing while the page is open has already been read.
      if (payload.message.sender === "ADMIN") {
        clearSupportUnread();
        markSupportRead().catch(() => {});
      }
    },
    onResync: reload,
  });

  // Pinned to the newest message. `auto` on first paint so the thread opens at
  // the bottom rather than visibly scrolling there.
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
      // Cleared only once the server has it: a failed send that had already
      // emptied the box would lose what was typed.
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
    <div>
      <PageHead
        title="Contact Billionax"
        subtitle="Questions about coins, settlements, payouts or your account — answered by the platform team"
      />

      <div className={styles.panel}>
        <div className={styles.thread}>
          {loading && <Loading />}

          {!loading && !messages.length && (
            <div className={styles.empty}>
              <b>No messages yet</b>
              <i>
                Ask us anything about your inventory, a settlement or your payout account. This
                conversation is private to your account.
              </i>
            </div>
          )}

          {withDayBreaks(messages).map(({ message: m, day, startsDay }) => {
            // Reversed from the platform's view: here OUR messages are the
            // ones on the right.
            const mine = m.sender === "GUEST";

            return (
              <div key={m.id}>
                {startsDay && <div className={styles.day}>{day}</div>}
                <div className={`${styles.msg} ${mine ? styles.mine : styles.theirs}`}>
                  <div className={styles.bubble}>
                    {/* Named on our own side only: the platform answers as
                        "Billionax support", and which individual admin replied
                        is deliberately not surfaced. */}
                    {mine && m.authorName && <em>{m.authorName}</em>}
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
            placeholder="Write to the Billionax team"
            // 1, not 2: --composer-h in the CSS sets the height now, and a
            // rows=2 intrinsic height would fight it.
            rows={1}
            maxLength={2000}
            // Enter sends, Shift+Enter breaks the line — the convention every
            // messaging app already uses.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e);
              }
            }}
            // Grows with the message up to the CSS max-height, then scrolls.
            onInput={(e) => autoGrow(e.target)}
          />
          <button type="submit" disabled={!draft.trim() || sending}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>

      <p className={styles.foot}>
        Replies arrive here and raise a badge on this tab. For anything urgent about a guest in
        the building, use the bill screen rather than this thread.
      </p>
    </div>
  );
};

export default HotelSupportPage;
