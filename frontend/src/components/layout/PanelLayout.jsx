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
      <div className={styles.panel}>
        <aside className={`${styles.rail} ${open ? styles.railOpen : ""}`}>
          <div className={styles.brand}>
            <span className={styles.logo} />
            <span>
              <b>{brand}</b>
              <i>{subtitle}</i>
            </span>
          </div>

          <nav className={styles.nav}>
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => `${styles.nv} ${isActive ? styles.nvOn : ""}`}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.spacer} />

          <div className={styles.user}>
            <span className={styles.userAvatar}>{initials(user?.name)}</span>
            <span className={styles.userMeta}>
              <b>{user?.name}</b>
              <i>{user?.role?.replace("_", " ").toLowerCase()}</i>
            </span>
          </div>
          <button className={styles.signout} onClick={signOut}>
            Sign out
          </button>
        </aside>

        <div className={styles.body}>
          <button
            className={styles.burger}
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <span />
            <span />
            <span />
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
