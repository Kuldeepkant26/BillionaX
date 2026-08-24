import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useThemeRoot } from "./useThemeRoot.js";
import { useAppStore } from "../../store/useAppStore.js";
import { logout as logoutApi } from "../../api/auth.api.js";
import { initials } from "../../utils/format.js";
import { Toasts } from "../common/index.jsx";
import styles from "./PanelLayout.module.css";

/**
 * Shared chrome for the hotel and admin panels. Both use Ink Minimal, so the
 * only difference is the nav items and the brand line.
 */
const burgerBar = "block w-[18px] h-0.5 bg-ink rounded-[2px]";

const PanelLayout = ({ brand, subtitle, nav }) => {
  useThemeRoot("ink-minimal");

  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
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
    <div className="theme-root" data-theme="ink-minimal">
      <div className="grid grid-cols-1 [@media(min-width:901px)]:grid-cols-[232px_1fr] min-h-[100svh] bg-canvas">
        <aside className={`bg-[var(--rail)] text-[var(--railfg)] px-3.5 py-[22px] flex flex-col gap-1 sticky top-0 h-[100svh] overflow-y-auto ${styles.rail} ${open ? styles.railOpen : ""}`}>
          <div className="flex items-center gap-[11px] px-2 pb-[18px] mb-3.5 border-b border-b-white/10">
            <span className={`w-[31px] h-[31px] rounded-[9px] bg-[var(--acc2)] flex-none relative ${styles.logo}`} />
            <span>
              <b className="block font-display text-[14.5px] font-semibold leading-[1.2]">{brand}</b>
              <i className="not-italic text-[9.5px] tracking-[0.12em] uppercase text-[var(--raildim)] font-bold">
                {subtitle}
              </i>
            </span>
          </div>

          <nav className="flex flex-col gap-[3px]">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-[11px] px-[11px] py-2.5 rounded-[10px] text-[13px] transition-[background,color] duration-150 ${styles.nv} ${
                    isActive
                      ? "bg-[var(--railact)] text-[var(--railacttx)] font-semibold"
                              : "font-medium text-[var(--raildim)] hover:bg-white/[0.07] hover:text-[var(--railfg)]"
                  }`
                }
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex-1 min-h-5" />

          <div className="flex items-center gap-2.5 pt-3.5 border-t border-t-white/10">
            <span className="w-[34px] h-[34px] rounded-[11px] bg-white/[0.14] text-[var(--railfg)] grid place-items-center text-[11.5px] font-bold flex-none">
              {initials(user?.name)}
            </span>
            <span className="min-w-0">
              <b className="block text-[12.5px] font-semibold text-[var(--railfg)] overflow-hidden text-ellipsis whitespace-nowrap">
                {user?.name}
              </b>
              <i className="not-italic text-[10.5px] text-[var(--raildim)] capitalize">
                {user?.role?.replace("_", " ").toLowerCase()}
              </i>
            </span>
          </div>
          <button
            className="mt-2.5 bg-transparent border border-white/[0.16] text-[var(--raildim)] rounded-full p-2 text-xs font-semibold cursor-pointer transition-[color,border-color] duration-150 hover:text-[var(--railfg)] hover:border-white/40"
            onClick={signOut}
          >
            Sign out
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
      <Toasts />
    </div>
  );
};

export default PanelLayout;
