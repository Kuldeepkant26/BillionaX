import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useThemeRoot, useAccentStyle, useFontRoot } from "./useThemeRoot.js";
import { useRealtime } from "../../hooks/useRealtime.js";
import { useBillRealtime } from "../../hooks/useBillRealtime.js";
import { BillPopup } from "../../features/guest/BillPopup.jsx";
import { useAccentSync } from "../../hooks/useAccentSync.js";
import { useGuestMemberships } from "../../hooks/useGuestMemberships.js";
import { useSupportBadge } from "../../hooks/useSupportBadge.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { Toasts } from "../common/index.jsx";
import styles from "./GuestLayout.module.css";

/**
 * The bottom nav, in order: Home, Offers, Alerts, Help, You.
 *
 * Feed is `optional` — it is only in the bar when the main admin has switched
 * it on (Platform rules → Guest app). The network launched without it, so the
 * default bar is five tabs and the toggle makes it six; see the scrolling note
 * on the <nav> below for what happens at six.
 *
 * Feed sits second, where it was, rather than being appended at the end:
 * turning the switch on should restore the bar guests and staff already know,
 * not produce a different one.
 */
const NAV = [
  { to: ROUTES.APP, label: "Home", end: true, icon: "M3 8.5L10 3l7 5.5V17a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1z" },
  // Pay used to sit here. It moved out of the nav rather than away: it is the
  // primary quick action on the home screen, so a tab of its own was a second
  // door to the same room. /app/pay is untouched — GuestHomePage and BillPopup
  // still navigate there, and old notification hrefs still resolve.
  //
  // Hand-written path, like every icon here — the app ships no icon library.
  // A stack of photos: back frame, front frame, and the mountain-and-sun mark
  // that reads as a picture at 19px.
  { to: ROUTES.APP_FEED, label: "Feed", optional: true, icon: "M6.5 3.2h10.3a1 1 0 0 1 1 1v9.3M3.2 6.5v9.8a1 1 0 0 0 1 1h9.8a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1H4.2a1 1 0 0 0-1 1zm2.1 8.4 2.8-3.1 1.9 2 1.7-1.8 1.6 1.7" },
  { to: ROUTES.APP_OFFERS, label: "Offers", icon: "M10 2l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L5.5 15.8l.9-5L2.8 7.3l5-.7z" },
  // Hand-written path, matching the other icons — the app ships no icon library.
  { to: ROUTES.APP_ALERTS, label: "Alerts", badge: true, icon: "M10 2.6a4.6 4.6 0 0 0-4.6 4.6c0 3.5-1.2 4.6-1.2 4.6h11.6s-1.2-1.1-1.2-4.6A4.6 4.6 0 0 0 10 2.6zM8.4 14.4a1.7 1.7 0 0 0 3.2 0z" },
  // A speech bubble with a question mark, drawn to the same 20x20 box as its
  // neighbours. The bubble alone reads as "messages"; the mark is what makes
  // it "help" at 19px.
  {
    to: ROUTES.APP_HELP,
    label: "Help",
    supportBadge: true,
    icon: "M10 2.6c-3.9 0-7 2.5-7 5.7 0 1.8 1 3.4 2.6 4.4l-.7 2.9 3.1-1.7c.6.1 1.3.2 2 .2 3.9 0 7-2.5 7-5.8s-3.1-5.7-7-5.7zm-.8 8.9h1.6v1.5H9.2zm.8-5.9c1.3 0 2.3.9 2.3 2 0 .8-.4 1.2-1 1.7-.5.4-.7.6-.7 1.1v.3H9.2v-.4c0-.9.4-1.4 1-1.8.5-.4.7-.6.7-1 0-.4-.4-.7-.9-.7s-.9.3-.9.9H7.6c0-1.2 1-2.1 2.4-2.1z",
  },
  { to: ROUTES.APP_PROFILE, label: "You", icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z" },
];

const GuestLayout = () => {
  const guestTheme = useAppStore((s) => s.guestTheme);
  const accent = useAppStore((s) => s.accent);
  useThemeRoot(guestTheme);
  useAccentSync();
  const accentStyle = useAccentStyle();
  const font = useFontRoot();
  useRealtime();
  // Bills must reach the guest on any screen, so this lives in the shell.
  useBillRealtime();
  useGuestMemberships();
  // The Help tab's dot has to be right on any screen, so it lives in the shell
  // for the same reason useBillRealtime does.
  useSupportBadge();

  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const unread = useAppStore((s) => s.unread);
  const supportUnread = useAppStore((s) => s.supportUnread);
  const feedEnabled = useAppStore((s) => s.feedEnabled);
  const { pathname } = useLocation();
  const showNav = isAuthenticated && pathname.startsWith("/app");

  // Five tabs by default, six when the admin has switched the feed on.
  const items = NAV.filter((item) => !item.optional || feedEnabled);
  // Six no longer fit a 360px phone at a comfortable tap size, so the bar
  // scrolls horizontally instead of squeezing every tab narrower. Five stay
  // spread across the full width exactly as before — `justify-around` and
  // `justify-start` is the whole difference, which is why the overflow class
  // is applied unconditionally: with five items there is nothing to scroll.
  const crowded = items.length > 5;

  return (
    <div className="theme-root" data-theme={guestTheme} data-accent={accent} data-font={font} style={accentStyle}>
      {/* The guest app is used on a phone at a reception desk, so it is designed
          mobile-first and simply centres itself on larger screens. */}
      <div className="w-full max-w-[460px] mx-auto min-h-[100svh] flex flex-col relative bg-canvas">
        <main className={`flex-1 px-[18px] pt-5 ${showNav ? "pb-24" : "pb-7"}`}>
          <Outlet />
        </main>

        {showNav && (
          <nav
            className={`fixed bottom-3.5 left-1/2 -translate-x-1/2 w-[min(432px,calc(100vw-28px))] h-[58px] rounded-full flex items-center px-1.5 z-[60] ${
              crowded ? `justify-start overflow-x-auto ${styles.scroller}` : "justify-around"
            } ${styles.nav}`}
            aria-label="Main"
          >
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  // Padding tightened from 14px so five tabs fit a 360px phone
                  // without wrapping. shrink-0 matters only in the scrolling
                  // six-tab case: without it flex would compress the tabs back
                  // to fit and there would be nothing to scroll.
                  `flex flex-col shrink-0 items-center gap-[3px] px-[9px] py-[7px] rounded-full text-muted transition-[color,background] duration-150 ${
                    styles.navItem
                  } ${isActive ? styles.on : ""}`
                }
              >
                <span className="relative grid place-items-center">
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d={item.icon} />
                  </svg>
                  {item.badge && unread > 0 && (
                    <b
                      className="absolute -top-1 -right-[7px] min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--bad)] text-white text-[9px] font-bold leading-[15px] text-center tabular-nums"
                      aria-label={`${unread} unread`}
                    >
                      {unread > 9 ? "9+" : unread}
                    </b>
                  )}
                  {/* A plain dot, not a count, unlike Alerts. A guest has one
                      support thread, so the number would only ever say how
                      many messages are in the single conversation they are
                      about to open — the fact that there IS a reply is the
                      whole signal. */}
                  {item.supportBadge && supportUnread > 0 && (
                    <b
                      className="absolute -top-0.5 -right-1.25 w-2 h-2 rounded-full bg-bad"
                      aria-label="New reply from support"
                    />
                  )}
                </span>
                <i className="not-italic text-[10px]">{item.label}</i>
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div id="modal-root" />
      {/* Over every guest screen, so a bill reaches them wherever they are. */}
      <BillPopup />
      <Toasts />
    </div>
  );
};

export default GuestLayout;
