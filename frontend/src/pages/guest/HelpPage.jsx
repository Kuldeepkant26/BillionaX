import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/useAppStore.js";
import { supportUnreadCount } from "../../api/guest.api.js";
import { ROUTES } from "../../constants/routePaths.js";
import styles from "./HelpPage.module.css";

/**
 * The help centre: two doors, and nothing else.
 *
 * Deliberately not a hub with articles, status and contact details stacked on
 * it. A guest opens this with a problem already formed, and every extra block
 * is something to read past. The question is only ever "is this answered
 * already, or do I need a person?" — so the page asks exactly that.
 *
 * The FAQ is listed first because it is instant and free, and most questions
 * are already in it.
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

  const active =
    memberships.find((m) => String(m.hotelId?._id || m.hotelId) === String(activeHotelId)) ||
    memberships[0];
  const hotelName = active?.hotelId?.name;

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

  return (
    <div>
      <button type="button" className={styles.back} onClick={() => navigate(ROUTES.APP)}>
        ← Home
      </button>

      <header className={styles.head}>
        <h1>Help centre</h1>
        <p>Find an answer, or talk to us{hotelName ? ` about ${hotelName}` : ""}.</p>
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
              Chat with our agent
              {/* The count is announced here but not in the bottom nav: on this
                  screen it is the one thing that should pull the eye, and the
                  guest is deciding between two doors rather than glancing. */}
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

      <p className={styles.foot}>
        For anything about your room or your stay, the front desk
        {hotelName ? ` at ${hotelName}` : ""} will be faster than we can be.
      </p>
    </div>
  );
};

export default HelpPage;
