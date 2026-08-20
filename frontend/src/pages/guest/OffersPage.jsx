import { getHotelContent } from "../../api/guest.api.js";
import { useAppStore } from "../../store/useAppStore.js";
import { useAsync } from "../../hooks/useAsync.js";
import { Empty, ErrorState } from "../../components/common/index.jsx";
import { OffersSkeleton } from "../../features/guest/GuestSkeletons.jsx";
import { formatDate } from "../../utils/format.js";
import styles from "./OffersPage.module.css";

const OffersPage = () => {
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

  const offers = data?.offers || [];
  const content = data?.content || [];
  const all = [...offers, ...content];

  return (
    <div>
      <h1 className={`display ${styles.title}`}>What's on</h1>
      <p className={styles.sub}>{active?.hotelId?.name}</p>

      {!all.length ? (
        <Empty title="Nothing on right now" hint="Check back during your stay." />
      ) : (
        <div className={styles.grid}>
          {all.map((item) => (
            <article key={item._id} className={styles.item}>
              <span
                className={styles.img}
                style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
              />
              <div className={styles.body}>
                <b>{item.title}</b>
                {item.description && <p>{item.description}</p>}
                <span className={styles.meta}>
                  {item.outlet && <span className="badge">{item.outlet}</span>}
                  {item.validTo && <i>Until {formatDate(item.validTo)}</i>}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default OffersPage;
