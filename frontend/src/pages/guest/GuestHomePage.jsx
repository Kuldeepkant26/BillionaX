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

// Shared by the three stat tiles below — identical styling, so the strings
// live once rather than being repeated per tile.
const statLabel = "block no-underline text-[9px] text-muted tracking-[0.08em] uppercase";
const statValue = "block font-display text-base font-semibold mt-1";

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
      <header className="flex items-center justify-between mb-3.5">
        <span>
          <u className="block no-underline text-[10.5px] text-muted">Good evening</u>
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

      <div className="flex gap-[9px] mt-3.5">
        <Button block onClick={() => navigate(ROUTES.APP_REDEEM)} disabled={!active?.balance}>
          Use coins on a bill
        </Button>
        <Button block variant="ghost" onClick={() => navigate(ROUTES.APP_HISTORY)}>
          History
        </Button>
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
        <span className="bg-card border border-hairline rounded-token-sm px-2.5 py-[11px] text-center">
          <u className={statLabel}>Max discount</u>
          <b className={statValue}>{cap ? `${cap}%` : "—"}</b>
        </span>
      </div>

      {/* The hotel's gallery. Falls back to stock photography until they
          upload their own, so this is never an empty frame. */}
      <HotelShowcase slides={contentData?.content} hotelName={active?.hotelId?.name} />

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
                className={`relative overflow-hidden min-h-[92px] flex items-end rounded-token-sm border border-hairline px-[11px] py-2.5 text-white ${styles.priv}`}
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

      {contentData?.offers?.length > 0 && (
        <section className="mt-6">
          {/* Named for the hotel rather than "Offers at …": this row carries
              whatever the property wants to show — a walkthrough, the rooftop,
              a promotion — so a heading that says "offers" undersells it. */}
          <span className="kicker">{hotelHeading(active?.hotelId)}</span>
          <div className={`flex flex-nowrap gap-2.5 mt-2.5 pb-1 ${styles.offerRow}`}>
            {/* One line that scrolls, so the cap is generous rather than a
                layout constraint. */}
            {contentData.offers.slice(0, 10).map((offer) => (
              <article key={offer._id} className="flex-none w-[152px]">
                <span
                  className={`block h-[94px] rounded-token-sm relative overflow-hidden ${styles.offerImg}`}
                  style={
                    offer.imageUrl ? { backgroundImage: `url(${offer.imageUrl})` } : undefined
                  }
                >
                  {/* A card reads as playable only when it actually has a
                      video, so the badge never promises something missing. */}
                  {offer.videoUrl && <i
                      className={`absolute inset-0 m-auto w-8 h-8 rounded-full bg-white/[0.92] z-[2] ${styles.play}`}
                      aria-hidden="true"
                    />}
                  {offer.videoUrl && offer.duration && (
                    <em className="absolute right-1.5 bottom-1.5 z-[2] not-italic text-[9px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded-full tabular-nums">
                      {offer.duration}
                    </em>
                  )}
                </span>
                <b className="block text-xs font-semibold mt-[7px]">{offer.title}</b>
                <u className="block no-underline text-[10px] text-muted">{offer.outlet || "Members only"}</u>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default GuestHomePage;
