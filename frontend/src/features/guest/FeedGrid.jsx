import { Link } from "react-router-dom";
import { feedImage } from "../../utils/upload.js";
import { feedPostPath } from "../../constants/routePaths.js";
import styles from "./FeedGrid.module.css";

/**
 * The square 3-across grid behind a profile and the saved screen.
 *
 * Shows the cover image only — the first of a carousel — with a small stack
 * mark when there is more than one, which is the affordance that says "there
 * are more photos inside" without loading any of them.
 */
export const FeedGrid = ({ posts = [] }) => (
  <div className={styles.grid}>
    {posts.map((post) => (
      <Link key={post.id} to={feedPostPath(post.id)} className={styles.cell}>
        <img
          src={feedImage(post.images?.[0], 220)}
          alt={post.caption?.slice(0, 60) || "Post"}
          loading="lazy"
          decoding="async"
        />
        {post.images?.length > 1 && (
          <span className={styles.stack} aria-label={`${post.images.length} photos`}>
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 3.4h9.6v9.6M3.4 6.6h9.8v9.8H3.4z" />
            </svg>
          </span>
        )}
      </Link>
    ))}
  </div>
);

export default FeedGrid;
