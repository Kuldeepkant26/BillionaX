import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  listHotelChatMessages,
  markHotelChatRead,
  sendHotelChatMessage,
} from "../../api/guest.api.js";
import { useSupportRealtime } from "../../hooks/useSupportRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { ErrorState } from "../../components/common/index.jsx";
import { autoGrow, timeLabel, withDayBreaks } from "../../utils/chat.js";
// Deliberately the support chat's stylesheet rather than a copy of it.
//
// This screen is the same object as that one — a thread that fills the
// viewport with a pinned composer — and the height arithmetic in there is
// tuned to the shell's padding. A duplicate would drift the moment either is
// adjusted, and the only thing that differs here is who is on the other end.
import styles from "./SupportChatPage.module.css";

/**
 * The guest's conversation with ONE of their hotels.
 *
 * The sibling of SupportChatPage, and structured identically — local state
 * merged by id, because a chat is append-only and arrives from three
 * directions (the load, the socket, the guest's own send).
 *
 * What differs is the address. The platform thread is "the guest's thread";
 * this one is keyed by {guest, hotel}, so the hotelId from the URL is threaded
 * through every call and every socket filter. Getting that wrong would not
 * error — it would quietly show one hotel's conversation under another's name,
 * which is why the id is read once here and passed explicitly everywhere.
 */

const HotelChatPage = () => {
  const navigate = useNavigate();
  const { hotelId } = useParams();
  const toastError = useAppStore((s) => s.toastError);
  const memberships = useAppStore((s) => s.memberships);
  // Clears this property's dot the moment the thread opens — see the read
  // effect below for why it is not left to the server round trip.
  const clearHotelUnread = useAppStore((s) => s.clearHotelUnread);

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const endRef = useRef(null);
  // Held so send() can shrink the box back after clearing the draft.
  const boxRef = useRef(null);

  // The property's name for the header. Read from the memberships already in
  // the store rather than fetched: the guest cannot reach this screen without
  // a membership, so it is always there, and a second request would leave the
  // title blank on first paint.
  const membership = memberships.find(
    (m) => String(m.hotelId?._id || m.hotelId) === String(hotelId)
  );
  const hotelName = membership?.hotelId?.name || "Your hotel";

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
   * two sibling chat pages.
   */
  const load = useCallback(async () => {
    try {
      const data = await listHotelChatMessages(hotelId);
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
  }, [hotelId]);

  /** load(), applied straight away. What retry and the socket resync use. */
  const reload = useCallback(async () => {
    const apply = await load();
    apply();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    // Wrapped so every setState lands after an await rather than synchronously
    // in the effect body. The cancelled flag drops a response that arrives
    // after unmount — or after the guest switched to another hotel's thread,
    // which is the same component with a different id.
    (async () => {
      const result = await load();
      if (!cancelled && result) result();
    })();

    return () => {
      cancelled = true;
    };
  }, [load]);

  /*
   * Switching hotels re-keys the whole screen.
   *
   * Without this, navigating from one property's thread to another would keep
   * the previous conversation on screen until the new load resolved — and the
   * merge-by-id append would then interleave the two. Clearing on hotelId is
   * what makes the transition a fresh thread rather than a mixed one.
   */
  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setError(null);
  }, [hotelId]);

  /*
   * Opening the thread IS reading it. Fired per hotel, since each property's
   * unread count is its own.
   *
   * The store is cleared OPTIMISTICALLY, before the request resolves, so the
   * dot disappears on the tap that brought the guest here rather than a round
   * trip later — the same thing SupportChatPage does with clearSupportUnread.
   * Without this the badge survived reading the conversation and only cleared
   * on the next full sync, which looks exactly like a broken counter.
   *
   * Scoped to this hotel: reading one property's thread must not clear a dot
   * belonging to another.
   */
  useEffect(() => {
    clearHotelUnread(hotelId);
    markHotelChatRead(hotelId).catch(() => {
      // The badge re-marks on the next open; failing loudly here would be
      // noise about a cosmetic count.
    });
  }, [hotelId, clearHotelUnread]);

  useSupportRealtime({
    // Both are required: the party alone would still let the guest's OTHER
    // hotels paint into this thread, since every one of them is the same
    // channel.
    party: "HOTEL_GUEST",
    hotelId,
    onMessage: (payload) => {
      if (!payload?.message) return;
      append(payload.message);

      // A reply landing while the thread is open has already been read, so the
      // badge the shell's hook just raised is cleared straight back down.
      if (payload.message.sender === "ADMIN") {
        clearHotelUnread(hotelId);
        markHotelChatRead(hotelId).catch(() => {});
      }
    },
    onResync: reload,
  });

  // Pinned to the newest message. `auto` on first paint so the thread opens at
  // the bottom rather than visibly scrolling there; smooth afterwards, when it
  // is a new message arriving.
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
      const data = await sendHotelChatMessage(hotelId, body);
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
          <h1>{hotelName}</h1>
          <p>The front desk answers here.</p>
        </div>
      </header>

      <div className={styles.thread}>
        {loading && <p className={styles.state}>Loading your messages…</p>}

        {!loading && !messages.length && (
          <div className={styles.empty}>
            <b>No messages yet</b>
            <i>
              Ask {hotelName} about your room, a booking or anything about your stay. The
              front desk replies here.
            </i>
          </div>
        )}

        {withDayBreaks(messages).map(({ message: m, day, startsDay }) => {
          // GUEST is the thread's owner — this guest. ADMIN is the side that
          // answers, which on this channel is the hotel, not the platform.
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
          placeholder={`Message ${hotelName}`}
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

export default HotelChatPage;
