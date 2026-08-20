import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listMemberships, getHotelContent } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { ROUTES } from "../../constants/routePaths.js";
import { MembershipCard } from "../../features/guest/MembershipCard.jsx";
import { HotelSwitcher } from "../../features/guest/HotelSwitcher.jsx";
import { HotelShowcase } from "../../features/guest/HotelShowcase.jsx";
import { Button, Empty, ErrorState } from "../../components/common/index.jsx";
import { HomeSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatCoins } from "../../utils/format.js";
import { avatarUrl } from "../../utils/upload.js";
import styles from "./GuestHomePage.module.css";

/**
 * "The Chandratal Palace · Udaipur", but just "Taj Hotel - Delhi" when the
 * name already carries the city — plenty of properties are named after where
 * they are, and "TAJ HOTEL - DELHI · DELHI" reads like a bug.
 */
const hotelHeading = (hotel) => {
  const name = hotel?.name;
  const city = hotel?.city;
  if (!name) return "";
  if (!city || name.toLowerCase().includes(city.toLowerCase())) return name;
  return `${name} · ${city}`;
};

const GuestHomePage = () => {
  const user = useAppStore((s) => s.user);
  const memberships = useAppStore((s) => s.memberships);
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const setMemberships = useAppStore((s) => s.setMemberships);
  const setActiveHotel = useAppStore((s) => s.setActiveHotel);
  const navigate = useNavigate();

  // GuestLayout's useGuestMemberships also loads these, but this page keeps its
  // own call for the loading and retry states the shell cannot provide.
  const { data, loading, error, run } = useAsync(listMemberships, []);

  useEffect(() => {
    if (data?.memberships) setMemberships(data.memberships);
  }, [data, setMemberships]);

  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));

  const { data: contentData } = useAsync(
    () => (activeHotelId ? getHotelContent(activeHotelId) : Promise.resolve(null)),
    [activeHotelId]
  );

  if (loading && !memberships.length) return <HomeSkeleton />;
  if (error && !memberships.length) return <ErrorState error={error} onRetry={run} />;

  if (!memberships.length) {
    return (
      <Empty
        title="No memberships yet"
        hint="Scan the Billionax QR code at your hotel's reception to get started."
      />
    );
  }

  const cap = active?.hotelId?.tierCaps?.[active?.tier];

  return (
    <div>
      <header className={styles.top}>
        <span>
          <u className={styles.greeting}>Good evening</u>
          <b className={`display ${styles.name}`}>{user?.name}</b>
        </span>

        {/* Links to the You tab rather than opening a picker here — one place
            owns changing the picture. */}
        <button
          type="button"
          className={styles.me}
          onClick={() => navigate(ROUTES.APP_PROFILE)}
          aria-label="Your account"
        >
          {user?.avatarUrl ? (
            <img src={avatarUrl(user.avatarUrl, 80)} alt="" />
          ) : (
            <span>{(user?.name || "?").trim().charAt(0).toUpperCase() || "?"}</span>
          )}
        </button>
      </header>

      <HotelSwitcher
        memberships={memberships}
        activeHotelId={activeHotelId}
        onSelect={setActiveHotel}
      />

      <div className={styles.cardWrap}>
        <MembershipCard
          membership={active}
          guestName={user?.name}
          hotelName={active?.hotelId?.name}
        />
      </div>

      <div className={styles.actions}>
        <Button block onClick={() => navigate(ROUTES.APP_REDEEM)} disabled={!active?.balance}>
          Use coins on a bill
        </Button>
        <Button block variant="ghost" onClick={() => navigate(ROUTES.APP_HISTORY)}>
          History
        </Button>
      </div>

      <div className={styles.stats}>
        <span className={styles.stat}>
          <u>Earned</u>
          <b>{formatCoins(active?.lifetimeEarned)}</b>
        </span>
        <span className={styles.stat}>
          <u>Redeemed</u>
          <b>{formatCoins(active?.lifetimeRedeemed)}</b>
        </span>
        <span className={styles.stat}>
          <u>Max discount</u>
          <b>{cap ? `${cap}%` : "—"}</b>
        </span>
      </div>

      {/* The hotel's gallery. Falls back to stock photography until they
          upload their own, so this is never an empty frame. */}
      <HotelShowcase slides={contentData?.content} hotelName={active?.hotelId?.name} />

      {/* Already filtered to this guest's tier by the API — anything they are
          not entitled to never reaches the payload. */}
      {contentData?.privileges?.length > 0 && (
        <section className={styles.section}>
          <span className="kicker">Your privileges</span>
          <div className={styles.privGrid}>
            {/* Not capped at 4: the grid fills two rows then scrolls
                sideways, so a hotel with six perks shows all six. */}
            {contentData.privileges.slice(0, 8).map((privilege) => (
              <article
                key={privilege._id}
                className={styles.priv}
                style={
                  privilege.imageUrl
                    ? { backgroundImage: `url(${privilege.imageUrl})` }
                    : undefined
                }
              >
                <span className={styles.privBody}>
                  <b>{privilege.title}</b>
                  {privilege.valueLabel && <u>{privilege.valueLabel}</u>}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      {contentData?.offers?.length > 0 && (
        <section className={styles.section}>
          {/* Named for the hotel rather than "Offers at …": this row carries
              whatever the property wants to show — a walkthrough, the rooftop,
              a promotion — so a heading that says "offers" undersells it. */}
          <span className="kicker">{hotelHeading(active?.hotelId)}</span>
          <div className={styles.offerRow}>
            {/* One line that scrolls, so the cap is generous rather than a
                layout constraint. */}
            {contentData.offers.slice(0, 10).map((offer) => (
              <article key={offer._id} className={styles.offer}>
                <span
                  className={styles.offerImg}
                  style={
                    offer.imageUrl ? { backgroundImage: `url(${offer.imageUrl})` } : undefined
                  }
                >
                  {/* A card reads as playable only when it actually has a
                      video, so the badge never promises something missing. */}
                  {offer.videoUrl && <i className={styles.play} aria-hidden="true" />}
                  {offer.videoUrl && offer.duration && (
                    <em className={styles.duration}>{offer.duration}</em>
                  )}
                </span>
                <b>{offer.title}</b>
                <u>{offer.outlet || "Members only"}</u>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default GuestHomePage;
