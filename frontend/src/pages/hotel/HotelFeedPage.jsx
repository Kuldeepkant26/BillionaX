import { useSearchParams } from "react-router-dom";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { PanelFeed } from "../../features/panel/PanelFeed.jsx";
import { useAppStore } from "../../store/useAppStore.js";
import { ROLES } from "../../store/slices/authSlice.js";
import styles from "../../features/panel/PanelTabs.module.css";

/**
 * The hotel's social presence.
 *
 * Unlike Guest content — which is the hotel's own marketing, scoped to its
 * guests — the feed is network-wide: a post here is seen by every Billionax
 * user, and so are the replies. That is why this is its own destination rather
 * than a fourth tab over there.
 *
 * The tab lives in the query string, matching GuestContentPage, so a manager
 * can bookmark "our posts" and Back steps between tabs as it does everywhere.
 */
const TABS = [
  {
    key: "posts",
    label: "Our posts",
    hint: "Everything this property has shared",
    icon: "M2.8 4.2h14.4v11.6H2.8zm1.9 8.6 3-3.2 2.6 2.6 2.4-2.4 2.6 2.7v1.9H4.7zM7 6.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8z",
  },
  {
    key: "comments",
    label: "Comments",
    hint: "Replies waiting on your posts",
    icon: "M2.8 4.5h14.4v9.2H7.4L3.9 16.6v-2.9H2.8z",
  },
  {
    key: "explore",
    label: "Explore",
    hint: "What everyone else is posting",
    icon: "M10 2.4a7.6 7.6 0 1 1 0 15.2 7.6 7.6 0 0 1 0-15.2zm3.3 4.3-5 1.9-1.6 4.4 5-1.9z",
  },
];

const HotelFeedPage = () => {
  const [params, setParams] = useSearchParams();
  const user = useAppStore((s) => s.user);
  const requested = params.get("tab");
  const active = TABS.some((t) => t.key === requested) ? requested : "posts";

  // An admin sees everything the property posted, staff included; a staff
  // member sees their own. The server enforces this either way — /feed/hotel
  // derives the hotel from the token, and /feed/mine from the caller.
  const scope = user?.role === ROLES.HOTEL_ADMIN ? "property" : "mine";

  return (
    <div>
      <PageHead
        title="Feed"
        subtitle="Your property on the Billionax feed — posts, replies and what others are sharing"
      />

      <div className={styles.tabs} role="tablist" aria-label="Feed sections">
        {TABS.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setParams({ tab: tab.key }, { replace: true })}
              className={`${styles.tab} ${on ? styles.on : ""}`}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.icon}>
                <path d={tab.icon} />
              </svg>
              <span className="min-w-0">
                <b>{tab.label}</b>
                <i>{tab.hint}</i>
              </span>
            </button>
          );
        })}
      </div>

      {/* Keyed so switching tabs remounts: each carries its own list and
          pagination, and page 3 of one is meaningless in another. */}
      <PanelFeed key={active} tab={active} scope={scope} />
    </div>
  );
};

export default HotelFeedPage;
