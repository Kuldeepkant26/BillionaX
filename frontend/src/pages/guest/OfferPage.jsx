import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getOffer } from "../../api/guest.api.js";
import { useAsync } from "../../hooks/useAsync.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useCountdown } from "../../hooks/useCountdown.js";
import { Button, ErrorState } from "../../components/common/index.jsx";
import { OfferArt } from "../../features/guest/OfferArt.jsx";
import { OfferSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { ROUTES } from "../../constants/routePaths.js";
import { endsIn, formatDate, mmss } from "../../utils/format.js";
import styles from "./OfferPage.module.css";

/**
 * One offer, in full.
 *
 * Every section is conditional: offers created before this screen existed have
 * a title and little else, and the page has to look deliberate with only that.
 */

const HOUR_SECONDS = 60 * 60;

/** "Gold & Platinum" / "Platinum only" — reads as a sentence, not an enum. */
const tierLabel = (tiers = []) => {
  const names = tiers.map((t) => t.charAt(0) + t.slice(1).toLowerCase());
  if (!names.length) return null;
  if (names.length === 1) return `${names[0]} only`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
};

const OfferScreen = ({ contentId }) => {
  const navigate = useNavigate();
  const activeHotelId = useAppStore((s) => s.activeHotelId);

  const { data, loading, error, run } = useAsync(
    () => getOffer(activeHotelId, contentId),
    [activeHotelId, contentId]
  );

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const offer = data?.offer;

  // The hook already owns "what time is it" — reading the clock again here
  // would be an impure call during render. It ticks once a second whenever a
  // target is set, so the display gates on the RESULT instead: under an hour
  // shows a live countdown, anything longer falls back to the coarse day form
  // below and the seconds are simply ignored.
  const secondsLeft = useCountdown(offer?.validTo || null);

  if (loading && !data) return <OfferSkeleton />;

  // A 404 here almost always means the offer ended while it was on screen, so
  // it gets its own copy rather than the generic "could not load" panel, which
  // would read as a bug.
  if (error?.status === 404) {
    return (
      <div className="py-14 text-center">
        <b className="block font-display text-[18px] font-semibold">This offer has ended</b>
        <p className="mx-auto mt-2 max-w-[34ch] text-[12.5px] leading-[1.55] text-muted">
          It may have expired or been withdrawn. There may be others running now.
        </p>
        <div className="mt-5">
          <Button onClick={() => navigate(ROUTES.APP_OFFERS, { replace: true })}>
            See all offers
          </Button>
        </div>
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={run} />;
  if (!offer) return null;

  const tiers = tierLabel(offer.tiers);
  // Only the last hour is worth a ticking clock; before that a day-granularity
  // line says the same thing without implying second-by-second urgency.
  const ticking = secondsLeft > 0 && secondsLeft < HOUR_SECONDS;

  return (
    <div className={styles.page}>
      <div className={styles.heroWrap}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className={styles.back}
          aria-label="Go back"
        >
          <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="#fff">
            <path d="M15.4 4.6 7 13l8.4 8.4 1.6-1.6L10.2 13 17 6.2z" />
          </svg>
        </button>
        <OfferArt offer={offer} size="hero" />
      </div>

      <div className={styles.body}>
        {offer.discountLabel && (
          <b className="block font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.5px] text-[var(--acc)]">
            {offer.discountLabel}
          </b>
        )}

        <h1 className="mt-1 font-display text-[19px] font-semibold leading-[1.25]">
          {offer.title}
        </h1>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {offer.outlet && <span className="badge">{offer.outlet}</span>}
          {tiers && <span className="badge badge-acc">{tiers}</span>}
          {offer.validTo && (
            <span className={ticking ? styles.urgent : "text-[11.5px] text-muted"}>
              {ticking ? `Ends in ${mmss(secondsLeft)}` : endsIn(offer.validTo)}
            </span>
          )}
        </div>

        {offer.description && (
          <p className="mt-4 whitespace-pre-wrap text-[13px] leading-[1.6] text-muted">
            {offer.description}
          </p>
        )}

        {offer.howToRedeem && (
          <div className={styles.redeem}>
            <span className="kicker mb-1.5">How to claim</span>
            <p className="text-[12.5px] leading-[1.55]">{offer.howToRedeem}</p>
          </div>
        )}

        {(offer.validFrom || offer.validTo) && (
          <p className="mt-4 text-[11.5px] text-muted">
            {offer.validFrom && offer.validTo
              ? `Valid ${formatDate(offer.validFrom)} – ${formatDate(offer.validTo)}`
              : offer.validTo
                ? `Valid until ${formatDate(offer.validTo)}`
                : `From ${formatDate(offer.validFrom)}`}
          </p>
        )}

        {/* Fine print should not compete with the offer. */}
        {offer.terms && (
          <details className={styles.terms}>
            <summary>Terms &amp; conditions</summary>
            <p>{offer.terms}</p>
          </details>
        )}
      </div>
    </div>
  );
};

/** Keyed on the id so navigating between offers resets the screen. */
const OfferPage = () => {
  const { contentId } = useParams();
  return <OfferScreen key={contentId} contentId={contentId} />;
};

export default OfferPage;
