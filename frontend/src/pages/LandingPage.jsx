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
        <em>Luxury for everyone.</em>
        <b>Privileges for members.</b>
      </h1>

      <p className={styles.sub}>
        Earn Billionax Coins on every stay. Redeem exclusive privileges across dining, wellness,
        upgrades and luxury experiences.
      </p>

      <p className={styles.value}>
        <span className="kicker">Benefits worth up to</span>
        <b>
          ₹25,000+<span>per year*</span>
        </b>
      </p>

      {/* Directly beneath the plate rather than down by the CTA: the asterisk
          and its terms have to read as one statement, and three sections
          apart it looked like unrelated fine print. */}
      <p className={styles.note}>
        *Indicative annual value based on typical member earning and redemption across participating
        hotels. Actual benefits vary by property, tier and usage.
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
