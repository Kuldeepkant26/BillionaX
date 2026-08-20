import { formatCoins } from "../../utils/format.js";
import styles from "./MembershipCard.module.css";

const TIER_LABEL = { SILVER: "Silver member", GOLD: "Gold member", PLATINUM: "Platinum member" };

/*
 * There is deliberately no tier-progress bar here.
 *
 * Tier is earned by NIGHTS STAYED at the hotel (see the API's
 * resolveTierByNights), and the guest app has no nights figure to show
 * progress against — the card only knows coins. The bar that used to live
 * here counted lifetimeEarned, so after the switch it reported things like
 * "0 more to reach Gold" to a guest whose coins had nothing to do with their
 * tier. Wrong information is worse than none.
 *
 * If progress belongs on this card later, the membership payload needs to
 * carry lifetimeNights and the hotel's tierNightThresholds.
 */
export const MembershipCard = ({ membership, guestName, hotelName }) => {
  return (
    <div className={`${styles.card} ${styles[membership?.tier?.toLowerCase()] || ""}`}>
      <span className={styles.shine} />

      <span className={styles.tier}>{TIER_LABEL[membership?.tier] || "Member"}</span>

      <span className={styles.balance}>
        {formatCoins(membership?.balance)} <i>coins</i>
      </span>

      <span className={styles.no}>{membership?.memberNo}</span>

      <span className={styles.foot}>
        <span>{(guestName || "").toUpperCase()}</span>
        <span>{(hotelName || "").toUpperCase()}</span>
      </span>
    </div>
  );
};
