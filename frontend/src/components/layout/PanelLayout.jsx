import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useThemeRoot, useAccentStyle } from "./useThemeRoot.js";
import { useAccentSync } from "../../hooks/useAccentSync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { logout as logoutApi } from "../../api/auth.api.js";
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

const PanelLayout = ({ brand, subtitle, nav }) => {
  useThemeRoot("ink-minimal");
  useAccentSync();
  const accentStyle = useAccentStyle();

  const user = useAppStore((s) => s.user);
  const accent = useAppStore((s) => s.accent);
  const logout = useAppStore((s) => s.logout);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  const visible = nav.filter((item) => !item.roles || item.roles.includes(user?.role));

  return (
    <div className="theme-root" data-theme="ink-minimal" data-accent={accent} style={accentStyle}>
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
            <span className="w-10 h-10 rounded-full bg-white grid place-items-center flex-none shadow-[0_2px_10px_rgba(0,0,0,0.18)]">
              <img src="/logo.png" alt={brand} className="w-[26px] h-[26px] object-contain" />
            </span>
            <span className={`min-w-0 ${collapsed ? "[@media(min-width:901px)]:hidden" : ""}`}>
              <b className="block font-display text-[15px] font-semibold leading-[1.2]">{brand}</b>
              <i className="not-italic text-[9.5px] tracking-[0.12em] uppercase text-[var(--raildim)] font-bold">
                {subtitle}
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
