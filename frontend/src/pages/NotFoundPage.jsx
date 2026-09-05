import { Link } from "react-router-dom";
import { useAppStore } from "../store/useAppStore.js";
import { homeForRole, ROUTES } from "../constants/routePaths.js";
import { useThemeRoot, useAccentStyle, useFontRoot } from "../components/layout/useThemeRoot.js";

const NotFoundPage = () => {
  // Follows the guest preference: a dark 404 inside a light app reads as a bug.
  const guestTheme = useAppStore((s) => s.guestTheme);
  const accent = useAppStore((s) => s.accent);
  useThemeRoot(guestTheme);
  const accentStyle = useAccentStyle();
  const font = useFontRoot();

  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const to = isAuthenticated ? homeForRole(user?.role) : ROUTES.HOME;

  return (
    <div className="theme-root" data-theme={guestTheme} data-accent={accent} data-font={font} style={accentStyle}>
      <div
        style={{
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <h1 className="display" style={{ fontSize: 46 }}>
            404
          </h1>
          <p className="muted" style={{ margin: "10px 0 22px", fontSize: 13.5 }}>
            We couldn't find that page.
          </p>
          <Link to={to} className="btn">
            Go back
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
