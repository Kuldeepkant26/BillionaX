import { Navigate, useLocation } from "react-router-dom";
import { useAppStore } from "../store/useAppStore.js";
import { ROUTES, homeForRole } from "../constants/routePaths.js";
import { Loading } from "../components/common/index.jsx";

/** Requires a session. Sends unauthenticated users to the right login screen. */
export const ProtectedRoute = ({ children, loginPath = ROUTES.LOGIN }) => {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isBootstrapping = useAppStore((s) => s.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) return <Loading />;
  if (!isAuthenticated) return <Navigate to={loginPath} state={{ from: location }} replace />;

  return children;
};

/**
 * Restricts a subtree to specific roles. A signed-in user with the wrong role
 * is sent to their own home rather than a 404 — they are not lost, they are
 * simply in the wrong place.
 */
export const RoleRoute = ({ allow = [], children, loginPath = ROUTES.LOGIN }) => {
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isBootstrapping = useAppStore((s) => s.isBootstrapping);
  const location = useLocation();

  if (isBootstrapping) return <Loading />;
  if (!isAuthenticated) return <Navigate to={loginPath} state={{ from: location }} replace />;
  if (!allow.includes(user?.role)) return <Navigate to={homeForRole(user?.role)} replace />;

  return children;
};

/** Keeps signed-in users off the login screens. */
export const PublicOnlyRoute = ({ children }) => {
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const isBootstrapping = useAppStore((s) => s.isBootstrapping);

  if (isBootstrapping) return <Loading />;
  if (isAuthenticated) return <Navigate to={homeForRole(user?.role)} replace />;

  return children;
};
