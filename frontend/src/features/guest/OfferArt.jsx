import styles from "./OfferArt.module.css";

/**
 * The visual for an offer, wherever one is shown.
 *
 * This is the ONLY place that decides image-versus-fallback. Before it, four
 * call sites each wrote their own `style={imageUrl ? {...} : undefined}`
 * ternary, and an offer with no image rendered as a blank rectangle in all of
 * them.
 *
 * The fallback is not a placeholder: it is a designed card built from the
 * offer's own details — the discount set large on the theme's accent gradient,
 * slowly drifting. An offer without a photo should look deliberate.
 */

const SIZES = {
  tile: styles.tile, // 152px home-screen row
  card: styles.card, // full-width list card
  hero: styles.hero, // detail screen header
};

export const OfferArt = ({ offer, size = "card", className = "" }) => {
  const { imageUrl, discountLabel, title, outlet } = offer || {};

  if (imageUrl) {
    return (
      <span
        className={`${styles.art} ${SIZES[size]} ${className}`}
        style={{ backgroundImage: `url(${imageUrl})` }}
      >
        {/* The discount still needs saying over a photo, as a corner chip. */}
        {discountLabel && <em className={styles.chip}>{discountLabel}</em>}
      </span>
    );
  }

  return (
    <span className={`${styles.art} ${styles.fallback} ${SIZES[size]} ${className}`}>
      <span className={styles.drift} aria-hidden="true" />
      <span className={styles.fallbackInner}>
        {/* No discount set? The title carries the card instead, so an offer
            with neither a photo nor a headline value still reads as designed. */}
        <b className={discountLabel ? styles.value : styles.valueSmall}>
          {discountLabel || title}
        </b>
        {discountLabel && (outlet || title) && (
          <i className={styles.kicker}>{outlet || title}</i>
        )}
      </span>
    </span>
  );
};
