import { useCallback, useId, useState } from "react";
import { feedImage } from "../../utils/upload.js";
import {
  PRIVILEGE_PHOTO_WIDTH,
  privilegeCategory,
  privilegeEyebrow,
} from "./privilegeCategory.js";
import { PrivilegeIcon } from "./PrivilegeIcon.jsx";
import { PrivilegeSheet } from "./PrivilegeSheet.jsx";
import styles from "./PrivilegeCards.module.css";

/** Same cap as before the redesign: the row scrolls, so a hotel with six perks shows six. */
const MAX_CARDS = 8;

const ArrowGlyph = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path
      d="M5 12h13.2M13.4 7.2 18.2 12l-4.8 4.8"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PrivilegeCard = ({ privilege, onOpen }) => {
  const titleId = useId();
  const category = privilegeCategory(privilege);
  // A dead image link falls back to the drawn art rather than leaving a
  // blank ground where the photo should be. Keyed by _id upstream, so a
  // different privilege never inherits this flag.
  const [broken, setBroken] = useState(false);
  const photo = privilege.imageUrl && !broken ? feedImage(privilege.imageUrl, PRIVILEGE_PHOTO_WIDTH) : null;

  return (
    <article
      className={`${styles.card} ${category.tone === "light" ? styles.light : styles.dark}`}
      aria-labelledby={titleId}
    >
      <span className={styles.media} aria-hidden="true">
        {photo ? (
          <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
        ) : (
          <span className={styles.art}>
            <PrivilegeIcon name={category.icon} />
          </span>
        )}
      </span>

      <div className={styles.top}>
        <span className={styles.eyebrow}>{privilegeEyebrow(privilege)}</span>
        <span className={styles.chip}>
          <span className={styles.chipIcon}>
            <PrivilegeIcon name={category.icon} />
          </span>
          {/* Both are rendered; the card's width decides which one shows (and
              so which one a screen reader hears — display:none drops the
              other from the accessibility tree). */}
          <span className={styles.chipLabel}>
            <span className={styles.chipFull}>{category.chip}</span>
            <span className={styles.chipShort}>{category.short}</span>
          </span>
        </span>
      </div>

      <div className={styles.body}>
        <i className={styles.rule} aria-hidden="true" />
        <h3 id={titleId} className={styles.title}>
          {privilege.title}
        </h3>
        {privilege.description && <p className={styles.desc}>{privilege.description}</p>}

        {/* The whole card is the tap target — see .cta::after — but the
            button stays a real, labelled button for keyboard and screen
            reader users, rather than an onClick on the article. */}
        <button
          type="button"
          className={styles.cta}
          onClick={() => onOpen(privilege)}
          aria-label={`View details: ${privilege.title}`}
        >
          <span className={styles.ctaLabel}>View details</span>
          <span className={styles.ctaRing}>
            <ArrowGlyph />
          </span>
        </button>
      </div>
    </article>
  );
};

/**
 * The guest's privileges at this hotel, as a swipeable row of photo cards.
 *
 * `privileges` arrives already filtered to the guest's tier by the API, so
 * everything here is something they are entitled to. Renders nothing when
 * the hotel has published none.
 */
export const PrivilegeCards = ({ privileges }) => {
  const headingId = useId();
  const [open, setOpen] = useState(null);
  const close = useCallback(() => setOpen(null), []);

  const items = (privileges || []).slice(0, MAX_CARDS);
  if (!items.length) return null;

  return (
    <section className="mt-6" aria-labelledby={headingId}>
      <span className="kicker" id={headingId}>
        Your privileges
      </span>

      <div className={styles.row}>
        {items.map((privilege) => (
          <PrivilegeCard key={privilege._id} privilege={privilege} onOpen={setOpen} />
        ))}
      </div>

      {open && <PrivilegeSheet privilege={open} onClose={close} />}
    </section>
  );
};
