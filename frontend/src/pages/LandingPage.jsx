import { Link, Navigate } from "react-router-dom";
import { useAppStore } from "../store/useAppStore.js";
import { ROUTES, homeForRole } from "../constants/routePaths.js";
import styles from "./LandingPage.module.css";

/** Shown to anyone who lands on / without a QR. Signed-in users go to their home. */
const LandingPage = () => {
  const user = useAppStore((s) => s.user);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  if (isAuthenticated) return <Navigate to={homeForRole(user?.role)} replace />;

  return (
    <div className={styles.wrap}>
      <span className={styles.logo} />

      <h1 className={`display ${styles.title}`}>
        Your stay, <em>rewarded</em>.
      </h1>

      <p className={styles.sub}>
        Billionax turns every bill at your hotel into coins you can spend right there — on dinner,
        the spa, room service or the bar.
      </p>

      <div className={styles.steps}>
        <div className={styles.step}>
          <b>1</b>
          <span>Scan the QR code at your hotel's reception</span>
        </div>
        <div className={styles.step}>
          <b>2</b>
          <span>Get your digital membership card and welcome coins</span>
        </div>
        <div className={styles.step}>
          <b>3</b>
          <span>Show a code at the desk to knock coins off your bill</span>
        </div>
      </div>

      <Link to={ROUTES.LOGIN} className="btn btn-lg btn-block">
        I already have an account
      </Link>

      <div className={styles.staff}>
        <Link to={ROUTES.HOTEL_LOGIN}>Hotel staff</Link>
        <span>·</span>
        <Link to={ROUTES.ADMIN_LOGIN}>Billionax admin</Link>
      </div>
    </div>
  );
};

export default LandingPage;
