import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore.js";
import { selectHotelUnreadTotal } from "../../store/slices/supportSlice.js";
import { supportUnreadCount } from "../../api/guest.api.js";
import { ROUTES } from "../../constants/routePaths.js";
import styles from "./HelpPage.module.css";

/**
 * The help centre: three doors, and nothing else.
 *
 * Deliberately not a hub with articles, status and contact details stacked on
 * it. A guest opens this with a problem already formed, and every extra block
 * is something to read past. The question is only ever "is this answered
 * already, or do I need a person — and which person?" — so the page asks
 * exactly that.
 *
 * The order is deliberate and is a routing decision, not a visual one:
 *
 *   FAQ            instant, free, and already answers most questions.
 *   The hotel      anything about the STAY — a room, a booking, a request.
 *   Billionax      the account itself — coins, tiers, a bill that looks wrong.
 *
 * The hotel sits above the platform because the footer of this page used to
 * send those guests to the front desk by telephone: the stay is the hotel's to
 * answer, and routing it to the platform first only adds a relay.
 */

const BookIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 15.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M20 11.5c0 3.6-3.6 6.5-8 6.5a9.6 9.6 0 0 1-2.4-.3L5 20l1.2-3.3C4.8 15.5 4 13.6 4 11.5 4 7.9 7.6 5 12 5s8 2.9 8 6.5z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

// A bell on a desk — the front desk, as distinct from the speech bubble that
// means the platform's agent.
const DeskIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M4 18h16M6 18v-2a6 6 0 0 1 12 0v2M12 7V5m-1.5 0h3"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Arrow = () => (
  <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" className={styles.arrow}>
    <path
      d="M7.5 4.5L13 10l-5.5 5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HelpPage = () => {
  const navigate = useNavigate();
  const memberships = useAppStore((s) => s.memberships);
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const supportUnread = useAppStore((s) => s.supportUnread);
  const setSupportUnread = useAppStore((s) => s.setSupportUnread);

  // The hotel the guest is currently looking at, which is the default target
  // for the hotel door below. Its NAME is read from `target` rather than here,
  // since the switcher can point that elsewhere.
  const active =
    memberships.find((m) => String(m.hotelId?._id || m.hotelId) === String(activeHotelId)) ||
    memberships[0];

  /*
   * Unread replies from the guest's hotels, per property.
   *
   * Read from the STORE rather than fetched into local state here, which is
   * what an earlier version did. That version was wrong in a way that only
   * showed up while sitting on this screen: it fetched once on mount and had
   * no socket subscription, so a reply arriving while the guest looked at the
   * page left every dot exactly as it was.
   *
   * useGuestHotelChatBadge owns this key and keeps it live from the shell, so
   * this screen simply renders it — and cannot disagree with the nav dot,
   * which now reads the same numbers.
   */
  const hotelUnread = useAppStore((s) => s.hotelUnread);
  const hotelUnreadTotal = useAppStore(selectHotelUnreadTotal);

  // Which hotel the "message the hotel" door points at. Defaults to the one
  // the guest is currently looking at, which is nearly always the one they are
  // staying in — the switcher is for the exception, not the rule.
  const [chosenId, setChosenId] = useState(null);
  const [switching, setSwitching] = useState(false);

  const target =
    memberships.find((m) => String(m.hotelId?._id || m.hotelId) === String(chosenId)) || active;
  const targetId = target?.hotelId?._id || target?.hotelId;
  const targetName = target?.hotelId?.name;

  // What the door itself badges: the property it actually opens.
  const targetUnread = hotelUnread[String(targetId)] || 0;
  // What the switcher badges: everything the door does NOT reach, so a reply
  // from another hotel is still announced rather than hidden behind a
  // collapsed control.
  const otherUnread = hotelUnreadTotal - targetUnread;

  /*
   * Resyncs the badge on the way in.
   *
   * The socket keeps it live while the app is open, but a reply that arrived
   * while the phone was locked was never delivered to this tab. Same principle
   * as useRealtime's syncUnread: the socket is the optimisation, the server is
   * the truth.
   */
  useEffect(() => {
    let cancelled = false;
    supportUnreadCount()
      .then((data) => {
        if (!cancelled && typeof data?.unread === "number") setSupportUnread(data.unread);
      })
      .catch(() => {
        // The page is entirely usable without the badge.
      });

    return () => {
      cancelled = true;
    };
  }, [setSupportUnread]);

  /*
   * The hotel counts need no effect here.
   *
   * useGuestHotelChatBadge, mounted in the shell, already syncs them on mount,
   * on reconnect and on tab focus, and nudges them on every socket push. A
   * second fetch from this screen would race that one for the same key and
   * could write a count taken before a read landed — exactly the class of bug
   * supportUnreadSeq exists to prevent on the platform side.
   */

  return (
    <div>
      <button type="button" className={styles.back} onClick={() => navigate(ROUTES.APP)}>
        ← Home
      </button>

      <header className={styles.head}>
        <h1>Help centre</h1>
        {/* No longer "talk to us about {hotel}": the hotel is now its own
            door, and promising it here would send stay questions to the wrong
            queue. */}
        <p>Find an answer, or talk to a person.</p>
      </header>

      <div className={styles.options}>
        <button
          type="button"
          className={styles.option}
          onClick={() => navigate(ROUTES.APP_FAQ)}
        >
          <span className={styles.icon}>
            <BookIcon />
          </span>
          <span className={styles.body}>
            <b>FAQs</b>
            <i>How coins, bills and tiers work. Answered in your own numbers.</i>
          </span>
          <Arrow />
        </button>

        {/* Only where there is a hotel to write to. A guest who has not joined
            one yet sees the two original doors and nothing broken. */}
        {targetId && (
          <div className={styles.group}>
            <button
              type="button"
              className={styles.option}
              onClick={() => navigate(`/app/help/hotel/${targetId}`)}
            >
              <span className={styles.icon}>
                <DeskIcon />
                {targetUnread > 0 && <em className={styles.dot} aria-hidden="true" />}
              </span>
              <span className={styles.body}>
                <b>
                  Message {targetName || "your hotel"}
                  {/* THIS property's count, not the total across every hotel.
                      The door names one hotel and opens its thread, so badging
                      it with another property's reply points the guest at the
                      wrong conversation — the total belongs on the switcher
                      below, which is what reaches the others. */}
                  {targetUnread > 0 && (
                    <span className={styles.pill}>
                      {targetUnread > 9 ? "9+" : targetUnread} new
                    </span>
                  )}
                </b>
                <i>
                  Your room, a booking, or anything about your stay. The front desk reads
                  this.
                </i>
              </span>
              <Arrow />
            </button>

            {/* The switcher only exists for guests who belong to more than one
                property. For everyone else it would be a control with a single
                option — noise on a screen whose whole point is having none. */}
            {memberships.length > 1 && (
              <div className={styles.switcher}>
                <button
                  type="button"
                  className={styles.switchToggle}
                  onClick={() => setSwitching((open) => !open)}
                  aria-expanded={switching}
                >
                  {switching ? "Hide hotels" : "Message a different hotel"}
                  {/* Without this, a reply from a hotel the door does not
                      point at is announced by the nav dot and then leads to a
                      screen showing nothing new — the conversation is real but
                      hidden behind a collapsed control. */}
                  {!switching && otherUnread > 0 && (
                    <span className={styles.pill}>
                      {otherUnread > 9 ? "9+" : otherUnread} new
                    </span>
                  )}
                </button>

                {switching &&
                  memberships.map((m) => {
                    const id = String(m.hotelId?._id || m.hotelId);
                    const unread = hotelUnread[id] || 0;

                    return (
                      <button
                        key={id}
                        type="button"
                        className={styles.switchRow}
                        onClick={() => {
                          setChosenId(id);
                          setSwitching(false);
                          navigate(`/app/help/hotel/${id}`);
                        }}
                      >
                        <span>{m.hotelId?.name || "Hotel"}</span>
                        {unread > 0 && (
                          <span className={styles.pill}>{unread > 9 ? "9+" : unread} new</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className={styles.option}
          onClick={() => navigate(ROUTES.APP_HELP_CHAT)}
        >
          <span className={styles.icon}>
            <ChatIcon />
            {supportUnread > 0 && <em className={styles.dot} aria-hidden="true" />}
          </span>
          <span className={styles.body}>
            <b>
              {/* Named rather than "our agent": with a hotel door beside it,
                  the guest is choosing between two humans and needs to know
                  which is which. */}
              Message Billionax
              {/* The count is announced here but not in the bottom nav: on this
                  screen it is the one thing that should pull the eye, and the
                  guest is deciding between doors rather than glancing. */}
              {supportUnread > 0 && (
                <span className={styles.pill}>
                  {supportUnread > 9 ? "9+" : supportUnread} new
                </span>
              )}
            </b>
            <i>
              Send us a question about your account, a bill or your coins. We reply right here.
            </i>
          </span>
          <Arrow />
        </button>
      </div>

      {/* This used to send guests to the front desk by telephone, because
          there was no way to reach them from here. There is now, so the note
          explains the split rather than routing around it. */}
      <p className={styles.foot}>
        {targetId
          ? `Anything about your stay is fastest with ${targetName || "your hotel"}. Coins, tiers and bills are ours.`
          : "Join a hotel to message its front desk from here."}
      </p>
    </div>
  );
};

export default HelpPage;
