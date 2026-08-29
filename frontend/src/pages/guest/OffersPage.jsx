import { useNavigate } from "react-router-dom";
import { getHotelContent } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Empty, ErrorState } from "../../components/common/index.jsx";
import { OffersSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { OfferArt } from "../../features/guest/OfferArt.jsx";
import { offerPath } from "../../constants/routePaths.js";
import { endsIn } from "../../utils/format.js";

const OffersPage = () => {
  const navigate = useNavigate();
  const activeHotelId = useAppStore((s) => s.activeHotelId);
  const memberships = useAppStore((s) => s.memberships);
  const active = memberships.find((m) => String(m.hotelId?._id) === String(activeHotelId));

  const { data, loading, error, run } = useAsync(
    () => (activeHotelId ? getHotelContent(activeHotelId) : Promise.resolve(null)),
    [activeHotelId]
  );

  if (loading) return <OffersSkeleton />;

  // A 404 means "not a member here", which the content endpoint now enforces.
  // That is an empty state, not a failure — falling through renders the
  // "Nothing on right now" copy below rather than a full-page error.
  if (error && error.status !== 404) return <ErrorState error={error} onRetry={run} />;

  // Offers ONLY. Videos have their own kind and their own watch screen, and
  // slideshow photos are the home-screen gallery — folding either in here is
  // what made the three feel interchangeable. The API has already dropped
  // anything expired or aimed at another tier.
  const offers = data?.offers || [];

  return (
    <div>
      <h1 className="display text-[22px]">Offers</h1>
      <p className="text-muted text-[12.5px] mt-[5px] mb-[18px]">{active?.hotelId?.name}</p>

      {!offers.length ? (
        <Empty title="No offers right now" hint="Check back during your stay." />
      ) : (
        <div className="flex flex-col gap-3.5">
          {offers.map((item) => (
            // A real button, so keyboard and screen-reader behaviour comes for
            // free rather than being hand-rolled with role/tabIndex/onKeyDown.
            <button
              key={item._id}
              type="button"
              onClick={() => navigate(offerPath(item._id))}
              className="block w-full overflow-hidden rounded-token border border-hairline bg-card p-0 text-left transition-[border-color] duration-150 hover:border-[var(--acc)]"
            >
              <OfferArt offer={item} size="card" />

              <span className="block p-3.5">
                <b className="block font-display text-[15px] font-semibold">{item.title}</b>
                {item.description && (
                  <span className="mt-[5px] line-clamp-2 block text-[12.5px] leading-[1.5] text-muted">
                    {item.description}
                  </span>
                )}
                <span className="mt-[11px] flex items-center gap-[9px]">
                  {item.outlet && <span className="badge">{item.outlet}</span>}
                  {item.validTo && (
                    <i className="not-italic text-[10.5px] text-muted">{endsIn(item.validTo)}</i>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default OffersPage;
