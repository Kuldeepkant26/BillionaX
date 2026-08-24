import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useThemeRoot } from "./useThemeRoot.js";
import { useRealtime } from "../../hooks/useRealtime.js";
import { useGuestMemberships } from "../../hooks/useGuestMemberships.js";
import { useAppStore } from "../../store/useAppStore.js";
import { ROUTES } from "../../constants/routePaths.js";
import { Toasts } from "../common/index.jsx";
import styles from "./GuestLayout.module.css";

const NAV = [
  { to: ROUTES.APP, label: "Home", end: true, icon: "M3 8.5L10 3l7 5.5V17a1 1 0 0 1-1 1h-3v-5H7v5H4a1 1 0 0 1-1-1z" },
  { to: ROUTES.APP_REDEEM, label: "Redeem", icon: "M3 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1H5a2 2 0 0 0 0 4h12v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" },
  { to: ROUTES.APP_OFFERS, label: "Offers", icon: "M10 2l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L5.5 15.8l.9-5L2.8 7.3l5-.7z" },
  // Hand-written path, matching the other icons — the app ships no icon library.
  { to: ROUTES.APP_ALERTS, label: "Alerts", badge: true, icon: "M10 2.6a4.6 4.6 0 0 0-4.6 4.6c0 3.5-1.2 4.6-1.2 4.6h11.6s-1.2-1.1-1.2-4.6A4.6 4.6 0 0 0 10 2.6zM8.4 14.4a1.7 1.7 0 0 0 3.2 0z" },
  { to: ROUTES.APP_PROFILE, label: "You", icon: "M10 2.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8zM3.6 17c.6-3.4 3.2-5.2 6.4-5.2s5.8 1.8 6.4 5.2z" },
];

const GuestLayout = () => {
  const guestTheme = useAppStore((s) => s.guestTheme);
  useThemeRoot(guestTheme);
  useRealtime();
  useGuestMemberships();

  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const unread = useAppStore((s) => s.unread);
  const { pathname } = useLocation();
  const showNav = isAuthenticated && pathname.startsWith("/app");

  return (
    <div className="theme-root" data-theme={guestTheme}>
      {/* The guest app is used on a phone at a reception desk, so it is designed
          mobile-first and simply centres itself on larger screens. */}
      <div className="w-full max-w-[460px] mx-auto min-h-[100svh] flex flex-col relative bg-canvas">
        <main className={`flex-1 px-[18px] pt-5 ${showNav ? "pb-24" : "pb-7"}`}>
          <Outlet />
        </main>

        {showNav && (
          <nav
            className={`fixed bottom-3.5 left-1/2 -translate-x-1/2 w-[min(432px,calc(100vw-28px))] h-[58px] rounded-full flex items-center justify-around px-1.5 z-[60] ${styles.nav}`}
            aria-label="Main"
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  // Padding tightened from 14px so five tabs fit a 360px phone
                  // without wrapping.
                  `flex flex-col items-center gap-[3px] px-[9px] py-[7px] rounded-full text-muted transition-[color,background] duration-150 ${
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
                </span>
                <i className="not-italic text-[10px]">{item.label}</i>
              </NavLink>
            ))}
          </nav>
        )}
      </div>

      <div id="modal-root" />
      <Toasts />
    </div>
  );
};

export default GuestLayout;
