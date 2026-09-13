import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { listMemberships, getHotelContent } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { ROUTES, offerPath, videoPath } from "../../constants/routePaths.js";
import { videoPoster } from "../../utils/upload.js";
import { MembershipCard } from "../../features/guest/MembershipCard.jsx";
import { HotelSwitcher } from "../../features/guest/HotelSwitcher.jsx";
import { HotelShowcase } from "../../features/guest/HotelShowcase.jsx";
import { HowItWorks } from "../../features/guest/HowItWorks.jsx";
import { OfferArt } from "../../features/guest/OfferArt.jsx";
import { Empty, ErrorState } from "../../components/common/index.jsx";
import { HomeSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { endsIn, formatCoins, greeting } from "../../utils/format.js";
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

// Shared by the three stat tiles below — identical styling, so the strings
// live once rather than being repeated per tile.
const statLabel = "block no-underline text-[9px] text-muted tracking-[0.08em] uppercase";
const statValue = "block font-display text-base font-semibold mt-1";

const GuestHomePage = () => {
  const user = useAppStore((s) => s.user);
  const memberships = useAppStore((s) => s.memberships);
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  // Drives the count on the Pay tile, so an unpaid bill is visible from home.
  const pendingBills = useAppStore((s) => s.pendingBills);
  const setMemberships = useAppStore((s) => s.setMemberships);
  const setActiveHotel = useAppStore((s) => s.setActiveHotel);
  const navigate = useNavigate();

  // GuestLayout's useGuestMemberships also loads these, but this page keeps its
  // own call for the loading and retry states the shell cannot provide.
  const { data, loading, error, run } = useAsync(listMemberships, [], {
    cacheKey: "guest.memberships",
  });

  useEffect(() => {
    if (data?.memberships) setMemberships(data.memberships);
  }, [data, setMemberships]);

  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));

  const { data: contentData } = useAsync(
    () => (activeHotelId ? getHotelContent(activeHotelId) : Promise.resolve(null)),
    [activeHotelId],
    // The SAME key and deps as the Offers tab, so the two share one cache
    // entry and one in-flight request instead of each fetching the hotel's
    // content separately.
    { cacheKey: "guest.content" }
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
  // Mirrors coin.service.js: the guest's tier rate, falling back to the
  // hotel-wide one, so the explainer quotes the figure a stay would actually
  // credit rather than a number chosen for the screen.
  const earnRate =
    active?.hotelId?.tierEarnRates?.[active?.tier] ?? active?.hotelId?.earnRatePercent;

  return (
    <div>
      <header className="flex items-center justify-between mb-3.5">
        <span>
          <u className="block no-underline text-[10.5px] text-muted">{greeting()}</u>
          <b className="display text-[18px] tracking-[-0.2px]">{user?.name}</b>
        </span>

        {/* Links to the You tab rather than opening a picker here — one place
            owns changing the picture. */}
        <button
          type="button"
          className={`w-[38px] h-[38px] flex-none p-0 border-0 rounded-full overflow-hidden cursor-pointer grid place-items-center ${styles.me}`}
          onClick={() => navigate(ROUTES.APP_PROFILE)}
          aria-label="Your account"
        >
          {user?.avatarUrl ? (
            <img src={avatarUrl(user.avatarUrl, 80)} alt="" className="w-full h-full object-cover block" />
          ) : (
            <span className="font-display text-[15px] font-semibold text-white">
              {(user?.name || "?").trim().charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </button>
      </header>

      <HotelSwitcher
        memberships={memberships}
        activeHotelId={activeHotelId}
        onSelect={setActiveHotel}
      />

      <div className="mt-3.5">
        <MembershipCard
          membership={active}
          guestName={user?.name}
          hotelName={active?.hotelId?.name}
        />
      </div>

      {/*
        Icon-led actions, the way a payments app opens.
        No balance guard on Pay: a guest with zero coins still has bills to
        settle, and the old "must hold coins" rule would lock them out of the
        payment screen entirely.
      */}
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={() => navigate(ROUTES.APP_PAY)}>
          <span className={`${styles.actionIcon} ${styles.actionPay}`}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
              <path
                d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path d="M3 10.5h18" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M6.5 14.5h3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            {pendingBills.length > 0 && (
              <em className={styles.actionBadge}>{pendingBills.length}</em>
            )}
          </span>
          <b>Pay</b>
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={() => navigate(ROUTES.APP_HISTORY)}
        >
          <span className={styles.actionIcon}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none">
              <circle cx="12" cy="12" r="8.4" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M12 7.6V12l3 1.8"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <b>History</b>
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={() => navigate(ROUTES.APP_OFFERS)}
        >
          <span className={styles.actionIcon}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none">
              <path
                d="M12 3.2l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <b>Offers</b>
        </button>

        <button
          type="button"
          className={styles.action}
          onClick={() => navigate(ROUTES.APP_PROFILE)}
        >
          <span className={styles.actionIcon}>
            <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" fill="none">
              <circle cx="12" cy="9" r="3.6" stroke="currentColor" strokeWidth="1.7" />
              <path
                d="M5 19.2c.8-3.5 3.6-5.4 7-5.4s6.2 1.9 7 5.4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <b>You</b>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3.5">
        <span className="bg-card border border-hairline rounded-token-sm px-2.5 py-[11px] text-center">
          <u className={statLabel}>Earned</u>
          <b className={statValue}>{formatCoins(active?.lifetimeEarned)}</b>
        </span>
        <span className="bg-card border border-hairline rounded-token-sm px-2.5 py-[11px] text-center">
          <u className={statLabel}>Redeemed</u>
          <b className={statValue}>{formatCoins(active?.lifetimeRedeemed)}</b>
        </span>
        {/* "Typical", not "Max", since per-service caps landed: this is the
            guest's tier rate, which is what an untagged line still prices at,
            but a hotel may set a particular outlet higher or lower. Promising
            a maximum the bill can exceed would be the wrong way round. */}
        <span className="bg-card border border-hairline rounded-token-sm px-2.5 py-[11px] text-center">
          <u className={statLabel}>Typical discount</u>
          <b className={statValue}>{cap ? `${cap}%` : "—"}</b>
        </span>
      </div>

      {/* The hotel's gallery. Falls back to stock photography until they
          upload their own, so this is never an empty frame. */}
      <HotelShowcase slides={contentData?.content} hotelName={active?.hotelId?.name} />

      {/* The explainer, using this guest's own rate and cap — see HowItWorks
          for why nothing here is defaulted to a marketing figure. */}
      <HowItWorks rate={earnRate} cap={cap} />

      {/* Already filtered to this guest's tier by the API — anything they are
          not entitled to never reaches the payload. */}
      {contentData?.privileges?.length > 0 && (
        <section className="mt-6">
          <span className="kicker">Your privileges</span>
          <div className={`gap-2 mt-2.5 ${styles.privGrid}`}>
            {/* Not capped at 4: the grid fills two rows then scrolls
                sideways, so a hotel with six perks shows all six. */}
            {contentData.privileges.slice(0, 8).map((privilege) => (
              <article
                key={privilege._id}
                className={`relative overflow-hidden min-h-[92px] flex items-end rounded-token-sm px-[11px] py-2.5 text-white ${styles.priv}`}
                style={
                  privilege.imageUrl
                    ? { backgroundImage: `url(${privilege.imageUrl})` }
                    : undefined
                }
              >
                <span className="relative z-[1]">
                  <b className="block text-[12.5px] font-semibold leading-[1.25]">{privilege.title}</b>
                  {privilege.valueLabel && (
                    <u className="block no-underline text-[10.5px] opacity-[0.88] mt-0.5">
                      {privilege.valueLabel}
                    </u>
                  )}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Videos and offers are separate rows, because they are separate
          things: one is watchable, the other is redeemable. They used to share
          a row, which is why a promotion with a clip attached showed up
          looking like a video. */}
      {contentData?.videos?.length > 0 && (
        <section className="mt-6">
          <span className="kicker">Watch</span>
          <div className={`flex flex-nowrap gap-2.5 mt-2.5 pb-1 ${styles.offerRow}`}>
            {contentData.videos.slice(0, 10).map((video) => (
              <article key={video._id} className="flex-none w-[152px]">
                <button
                  type="button"
                  onClick={() => navigate(videoPath(video._id))}
                  aria-label={`Play ${video.title}`}
                  className={`block h-[94px] w-full rounded-token-sm relative overflow-hidden cursor-pointer p-0 border-0 ${styles.offerImg}`}
                  style={
                    // A video with no cover of its own still gets art: the
                    // poster is a frame Cloudinary renders from the clip.
                    video.imageUrl || videoPoster(video.videoUrl, 320)
                      ? {
                          backgroundImage: `url(${
                            video.imageUrl || videoPoster(video.videoUrl, 320)
                          })`,
                        }
                      : undefined
                  }
                >
                  <i
                    className={`absolute inset-0 m-auto w-8 h-8 rounded-full bg-white/[0.92] z-[2] ${styles.play}`}
                    aria-hidden="true"
                  />
                  {video.duration && (
                    <em className="absolute right-1.5 bottom-1.5 z-[2] not-italic text-[9px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded-full tabular-nums">
                      {video.duration}
                    </em>
                  )}
                </button>
                <b className="block text-xs font-semibold mt-[7px] text-left">{video.title}</b>
                <u className="block no-underline text-[10px] text-muted text-left">
                  {video.outlet || "From the hotel"}
                </u>
              </article>
            ))}
          </div>
        </section>
      )}

      {contentData?.offers?.length > 0 && (
        <section className="mt-6">
          <span className="kicker">{hotelHeading(active?.hotelId)}</span>
          <div className={`flex flex-nowrap gap-2.5 mt-2.5 pb-1 ${styles.offerRow}`}>
            {contentData.offers.slice(0, 10).map((offer) => (
              <article key={offer._id} className="flex-none w-[152px]">
                <button
                  type="button"
                  onClick={() => navigate(offerPath(offer._id))}
                  aria-label={`View ${offer.title}`}
                  className="block w-full cursor-pointer border-0 p-0 text-left"
                >
                  <OfferArt offer={offer} size="tile" />
                  <b className="mt-[7px] block text-xs font-semibold">{offer.title}</b>
                  <u className="block text-[10px] text-muted no-underline">
                    {offer.validTo ? endsIn(offer.validTo) : offer.outlet || "Members only"}
                  </u>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default GuestHomePage;
