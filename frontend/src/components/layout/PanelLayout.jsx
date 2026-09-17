import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useThemeRoot, useAccentStyle, useFontRoot } from "./useThemeRoot.js";
import { useAccentSync } from "../../hooks/useAccentSync.js";
import { useRealtime } from "../../hooks/useRealtime.js";
import { useAppStore } from "../../store/useAppStore.js";
import { logout as logoutApi, me as fetchMe } from "../../api/auth.api.js";
import { initials } from "../../utils/format.js";
import { Button, Modal, Toasts } from "../common/index.jsx";
import styles from "./PanelLayout.module.css";

/**
 * Shared chrome for the hotel and admin panels. Both use the ink-minimal
 * neutrals plus the admin-chosen accent, so the only difference is the nav
 * items and the brand line.
 *
 * The rail has two independent responsive behaviours: below 901px it is a
 * slide-in drawer (styles.rail/railOpen), and at 901px+ it can be collapsed
 * to an icon rail. Every collapse class is gated behind the same 901px media
 * query — written out longhand, because Tailwind's scanner only picks up
 * complete class strings — so a collapsed rail still opens as a full-width
 * labelled drawer on a phone.
 */
const burgerBar = "block w-[18px] h-0.5 bg-ink rounded-[2px]";

const PanelLayout = ({ brand, subtitle, nav, showHotel = false }) => {
  useThemeRoot("ink-minimal");
  useAccentSync();
  // The panel had no socket at all before bills: staff need to see a payment
  // land while they are looking at the guest, not on the next refresh.
  useRealtime();
  const accentStyle = useAccentStyle();
  const font = useFontRoot();

  const user = useAppStore((s) => s.user);
  const accent = useAppStore((s) => s.accent);
  const logout = useAppStore((s) => s.logout);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const staffHotel = useAppStore((s) => s.staffHotel);
  const setStaffHotel = useAppStore((s) => s.setStaffHotel);
  const supportUnread = useAppStore((s) => s.supportUnread);
  const guestChatsUnread = useAppStore((s) => s.guestChatsUnread);
  const feedEnabled = useAppStore((s) => s.feedEnabled);
  const [open, setOpen] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Confirmed rather than immediate: the button sits at the bottom of the rail
  // right below the nav, and a mis-click discards any half-finished work on
  // the page behind it.
  const signOut = async () => {
    setSigningOut(true);
    try {
      await logoutApi();
    } catch {
      // Signing out locally matters more than the server round-trip.
    }
    logout();
    navigate("/", { replace: true });
  };

  /**
   * Loads the hotel for the brand line.
   *
   * Only for the hotel panel (showHotel), and only when it is not already in
   * the store — it is persisted, so a reload paints the right brand on the
   * first frame and this refresh just catches a rename or a new logo.
   */
  useEffect(() => {
    if (!showHotel || !user?.hotelId) return;
    let cancelled = false;

    fetchMe()
      .then((res) => {
        if (!cancelled && res?.hotel) setStaffHotel(res.hotel);
      })
      .catch(() => {
        // The panel is perfectly usable with the fallback brand line.
      });

    return () => {
      cancelled = true;
    };
  }, [showHotel, user?.hotelId, setStaffHotel]);

  // The hotel wins over the static brand when we have it; `brand` stays the
  // fallback so the rail is never blank while the first request is in flight.
  const title = (showHotel && staffHotel?.name) || brand;
  const kicker = showHotel && staffHotel?.name ? "Hotel panel" : subtitle;
  const logo = showHotel && !logoBroken ? staffHotel?.logoUrl : null;

  /*
   * Two independent filters, deliberately not merged.
   *
   * `roles` is about WHO the signed-in user is and never changes during a
   * session. `feature` is about what the platform currently offers and can be
   * switched off under a staff member who is looking at the tab — so it reads
   * from live store state rather than from the nav definition.
   */
  const features = { feed: feedEnabled };
  const visible = nav.filter(
    (item) =>
      (!item.roles || item.roles.includes(user?.role)) &&
      (!item.feature || features[item.feature])
  );

  // Counts a nav item can carry, keyed by the name an item's `badge` names.
  // Two entries: the session's own platform thread, and — on the hotel panel —
  // the property's queue of guest conversations. They are separate numbers on
  // separate nav items and can both be non-zero at once.
  const badges = { support: supportUnread, guestChats: guestChatsUnread };

  return (
    <div className="theme-root" data-theme="ink-minimal" data-accent={accent} data-font={font} style={accentStyle}>
      <div
        className={`grid grid-cols-1 ${
          collapsed
            ? "[@media(min-width:901px)]:grid-cols-[76px_1fr]"
            : "[@media(min-width:901px)]:grid-cols-[248px_1fr]"
        } min-h-[100svh] bg-canvas ${styles.shell}`}
      >
        {/* self-start keeps the sticky rail anchored to the top of its grid
            row; stretched to the row height (the default) it would sit
            centred against a long page and look detached. */}
        <aside
          className={`bg-[var(--rail)] text-[var(--railfg)] px-3 py-5 flex flex-col gap-1 sticky top-0 self-start h-[100svh] overflow-y-auto overflow-x-hidden ${styles.rail} ${
            open ? styles.railOpen : ""
          }`}
        >
          <div
            className={`flex items-center gap-[11px] px-1.5 pb-4 mb-3 border-b border-b-white/15 ${
              collapsed
                ? "[@media(min-width:901px)]:flex-col [@media(min-width:901px)]:gap-2.5 [@media(min-width:901px)]:px-0"
                : ""
            }`}
          >
            {/* The hotel's own logo when we have one, the app mark otherwise.
                object-cover on a hotel logo so a rectangular crest fills the
                circle; the app mark stays contained, since it is drawn to sit
                inside one. */}
            <span className="w-10 h-10 rounded-full bg-white grid place-items-center flex-none shadow-[0_2px_10px_rgba(0,0,0,0.18)] overflow-hidden">
              {logo ? (
                <img
                  src={logo}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={() => setLogoBroken(true)}
                />
              ) : (
                <img src="/logo.png" alt="" className="w-[26px] h-[26px] object-contain" />
              )}
            </span>
            <span className={`min-w-0 ${collapsed ? "[@media(min-width:901px)]:hidden" : ""}`}>
              {/* Two lines rather than truncate: a hotel's name is the brand
                  here, and "The Chandratal…" is not a name. Past two lines it
                  clamps, with the full name on hover. */}
              <b
                className="block font-display text-[14.5px] font-semibold leading-[1.25] line-clamp-2"
                title={title}
              >
                {title}
              </b>
              <i className="not-italic text-[9.5px] tracking-[0.12em] uppercase text-[var(--raildim)] font-bold">
                {kicker}
              </i>
            </span>
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`hidden [@media(min-width:901px)]:grid place-items-center w-7 h-7 rounded-full border border-white/25 text-[var(--raildim)] bg-transparent cursor-pointer flex-none transition-[color,border-color] duration-150 hover:text-[var(--railfg)] hover:border-white/50 ${
                collapsed ? "" : "ml-auto"
              }`}
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden="true"
                className={`w-3.5 h-3.5 fill-current transition-transform duration-200 ${
                  collapsed ? "rotate-180" : ""
                }`}
              >
                <path d="M12.8 4.2a1 1 0 0 1 0 1.4L8.4 10l4.4 4.4a1 1 0 1 1-1.4 1.4l-5.1-5.1a1 1 0 0 1 0-1.4l5.1-5.1a1 1 0 0 1 1.4 0z" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-1">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                title={item.label}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-[11px] px-3 py-2.5 rounded-xl text-[13px] transition-[background,color,box-shadow] duration-150 ${styles.nv} ${
                    collapsed
                      ? "[@media(min-width:901px)]:justify-center [@media(min-width:901px)]:px-0"
                      : ""
                  } ${
                    isActive
                      ? "bg-[var(--railact)] text-[var(--railacttx)] font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.14)]"
                      : "font-medium text-[var(--raildim)] hover:bg-white/[0.12] hover:text-[var(--railfg)]"
                  }`
                }
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                <span className={collapsed ? "[@media(min-width:901px)]:hidden" : ""}>
                  {item.label}
                </span>
                {/* An `item.badge` nav entry names a store key to count —
                    today only Support. Kept on the item rather than hardcoded
                    here so PanelLayout stays the shared shell it is, with no
                    knowledge of which panel or which page it is drawing.

                    Sits after the label and pushed right, so it lands at the
                    end of an expanded rail. On a collapsed rail the label is
                    hidden and ml-auto has nothing to push against, which is
                    why it falls back to hugging the icon. */}
                {item.badge && badges[item.badge] > 0 && (
                  <b
                    className={`ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-[var(--bad)] text-white text-[10px] font-bold leading-[18px] text-center tabular-nums ${
                      collapsed ? "[@media(min-width:901px)]:hidden" : ""
                    }`}
                    aria-label={`${badges[item.badge]} unread`}
                  >
                    {badges[item.badge] > 9 ? "9+" : badges[item.badge]}
                  </b>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex-1 min-h-5" />

          <div
            className={`flex items-center gap-2.5 pt-3.5 border-t border-t-white/15 ${
              collapsed ? "[@media(min-width:901px)]:justify-center" : ""
            }`}
          >
            <span
              className="w-[34px] h-[34px] rounded-[11px] bg-white/[0.18] text-[var(--railfg)] grid place-items-center text-[11.5px] font-bold flex-none"
              title={user?.name}
            >
              {initials(user?.name)}
            </span>
            <span className={`min-w-0 ${collapsed ? "[@media(min-width:901px)]:hidden" : ""}`}>
              <b className="block text-[12.5px] font-semibold text-[var(--railfg)] overflow-hidden text-ellipsis whitespace-nowrap">
                {user?.name}
              </b>
              <i className="not-italic text-[10.5px] text-[var(--raildim)] capitalize">
                {user?.role?.replace("_", " ").toLowerCase()}
              </i>
            </span>
          </div>
          <button
            className="mt-2.5 bg-transparent border border-white/25 text-[var(--raildim)] rounded-full p-2 text-xs font-semibold cursor-pointer transition-[color,border-color] duration-150 hover:text-[var(--railfg)] hover:border-white/60 flex items-center justify-center gap-1.5"
            onClick={() => {
              setOpen(false); // close the mobile drawer so the dialog is not behind it
              setConfirmSignOut(true);
            }}
            title="Sign out"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className={`w-3.5 h-3.5 fill-current hidden ${
                collapsed ? "[@media(min-width:901px)]:block" : ""
              }`}
            >
              <path d="M9 2h2v8H9zM5.9 4.7 4.5 3.3a8 8 0 1 0 11 0l-1.4 1.4a6 6 0 1 1-8.2 0z" />
            </svg>
            <span className={collapsed ? "[@media(min-width:901px)]:hidden" : ""}>Sign out</span>
          </button>
        </aside>

        <div className="px-4 pt-[18px] pb-8 [@media(min-width:901px)]:px-[26px] [@media(min-width:901px)]:pt-6 [@media(min-width:901px)]:pb-10 min-w-0 overflow-hidden">
          <button
            className="flex [@media(min-width:901px)]:hidden flex-col gap-1 bg-card border border-hairline rounded-[10px] p-2.5 cursor-pointer mb-4"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <span className={burgerBar} />
            <span className={burgerBar} />
            <span className={burgerBar} />
          </button>
          <Outlet />
        </div>
      </div>

      <div id="modal-root" />

      <Modal
        open={confirmSignOut}
        title="Sign out?"
        onClose={() => !signingOut && setConfirmSignOut(false)}
        footer={
          <div className="flex items-center gap-[9px]">
            <Button
              variant="ghost"
              block
              onClick={() => setConfirmSignOut(false)}
              disabled={signingOut}
            >
              Stay signed in
            </Button>
            <Button block onClick={signOut} disabled={signingOut}>
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </div>
        }
      >
        <p className="confirm-text">
          {user?.name ? <b>{user.name}</b> : "You"} will be signed out and returned to the sign-in
          screen. Anything unsaved on this page will be lost.
        </p>
      </Modal>

      <Toasts />
    </div>
  );
};

export default PanelLayout;
