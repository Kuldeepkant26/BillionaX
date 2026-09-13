import { useSearchParams } from "react-router-dom";
import { PageHead } from "../../features/panel/PageHead.jsx";
import { PanelFeed } from "../../features/panel/PanelFeed.jsx";
import styles from "../../features/panel/PanelTabs.module.css";

/**
 * The platform's own feed presence, plus moderation of everyone else's.
 *
 * The same three tabs the hotel panel has, with a fourth: Moderation is the
 * only screen in the app that can remove another person's post, and it is
 * MAIN_ADMIN-only on the server as well as here — /feed/moderation carries
 * requireRole, so hiding the tab is presentation, not the control.
 */
const TABS = [
  {
    key: "posts",
    label: "Our posts",
    hint: "What Billionax has shared",
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
    hint: "The network feed as guests see it",
    icon: "M10 2.4a7.6 7.6 0 1 1 0 15.2 7.6 7.6 0 0 1 0-15.2zm3.3 4.3-5 1.9-1.6 4.4 5-1.9z",
  },
  {
    key: "moderation",
    label: "Moderation",
    hint: "Every post, filterable and removable",
    icon: "M10 2.4l6.2 2.5v5c0 3.7-2.5 6.7-6.2 7.7-3.7-1-6.2-4-6.2-7.7v-5zm-.9 9.9 4.1-4.1-1.3-1.3-2.8 2.8-1.3-1.3-1.3 1.3z",
  },
];

const AdminFeedPage = () => {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = TABS.some((t) => t.key === requested) ? requested : "posts";

  return (
    <div>
      <PageHead
        title="Feed"
        subtitle="Billionax on the feed, and moderation for everything posted on it"
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

      <PanelFeed key={active} tab={active} scope="mine" />
    </div>
  );
};

export default AdminFeedPage;
