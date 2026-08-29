import { useSearchParams } from "react-router-dom";
import { PageHead } from "../../features/panel/PageHead.jsx";
import ContentPage from "./ContentPage.jsx";
import { KINDS } from "./guestContentKinds.js";
import styles from "./GuestContentPage.module.css";

/**
 * One place to manage everything a hotel publishes to its guests, split into
 * three tabs that stay separate: the home-screen slideshow, the offers, and
 * the videos.
 *
 * They were three unrelated nav entries before — and "Offers" had no nav entry
 * at all, so the page existed but nobody could reach it. Grouping them under
 * one destination makes the relationship obvious (these are the things guests
 * see) without merging the records themselves: each tab is its own kind, its
 * own list and its own form.
 *
 * The active tab lives in the query string so a manager can bookmark or share
 * "the videos screen", and the browser's Back button steps between tabs the
 * way it does everywhere else.
 */
const TABS = [
  {
    key: "slideshow",
    hint: "Gallery on the home screen",
    icon: "M2.5 4.5h15v11h-15zm2 8l3-3 2.5 2.5L14 8l2 2.5v3h-11zM7 6.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
  },
  {
    key: "offers",
    hint: "Promotions in the Offers tab",
    icon: "M10 2.2l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L2.5 7.7l5.2-.8z",
  },
  {
    key: "videos",
    hint: "Clips guests can watch",
    icon: "M2.5 5.5h10v9h-10zm11 3.2L17.5 6v8l-4-2.7z",
  },
];

const GuestContentPage = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = TABS.some((t) => t.key === requested) ? requested : "slideshow";

  return (
    <div>
      <PageHead
        title="Guest content"
        subtitle="Everything guests see in the app — each managed separately"
      />

      <div className={styles.tabs} role="tablist" aria-label="Guest content sections">
        {TABS.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              // replace: switching tabs is not a step worth a Back press each
              // time, but the URL still reflects where you are.
              onClick={() => setParams({ tab: tab.key }, { replace: true })}
              className={`${styles.tab} ${on ? styles.on : ""}`}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.icon}>
                <path d={tab.icon} />
              </svg>
              <span className="min-w-0">
                <b>{KINDS[tab.key].label}</b>
                <i>{tab.hint}</i>
              </span>
            </button>
          );
        })}
      </div>

      {/* Keyed so switching tabs remounts: each kind has its own list, filters
          and pagination, and carrying page 3 of the offers over to the videos
          would show an empty screen. */}
      <ContentPage key={active} kind={active} />
    </div>
  );
};

export default GuestContentPage;
