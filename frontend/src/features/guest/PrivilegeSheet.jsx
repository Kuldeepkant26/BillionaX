import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/common/index.jsx";
import { tierLabel } from "../../utils/format.js";
import { feedImage } from "../../utils/upload.js";
import {
  PRIVILEGE_PHOTO_WIDTH,
  privilegeCategory,
  privilegeEyebrow,
} from "./privilegeCategory.js";
import { PrivilegeIcon } from "./PrivilegeIcon.jsx";
// The card's tone tokens and its glass chip, shared rather than copied — the
// sheet is the card opened up, and two copies would drift the first time
// either was touched. (LikesSheet shares FeedCommentSheet's chrome the same
// way.)
import card from "./PrivilegeCards.module.css";
import styles from "./PrivilegeSheet.module.css";

/**
 * One privilege in full — where "View details" on a privilege card leads.
 *
 * The card clamps the description to three lines and cannot say where or for
 * whom the perk applies; this is the room for that. Everything shown is
 * already in the content payload, so opening it costs no request, and the
 * photo is the same URL the card fetched.
 *
 * A bottom sheet, portalled into #modal-root (inside the themed wrapper, so
 * the theme's variables reach it), on the same pattern as the feed sheets:
 * Escape, the scrim and the close button all dismiss it, and the page behind
 * stops scrolling while it is up.
 */
export const PrivilegeSheet = ({ privilege, onClose }) => {
  const titleId = useId();
  const closeRef = useRef(null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Mount-only, apart from the listener above: focus moves into the dialog
  // and returns to whatever opened it — the card's button — when it closes,
  // without scrolling the row or the page to get there.
  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);

  const category = privilegeCategory(privilege);
  const photo =
    privilege.imageUrl && !broken ? feedImage(privilege.imageUrl, PRIVILEGE_PHOTO_WIDTH) : null;
  const host = document.getElementById("modal-root") || document.body;

  return createPortal(
    <div className={styles.back} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div
        className={`${styles.sheet} ${category.tone === "light" ? card.light : card.dark}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.hero}>
          {photo ? (
            <img src={photo} alt="" decoding="async" onError={() => setBroken(true)} />
          ) : (
            <span className={styles.art} aria-hidden="true">
              <PrivilegeIcon name={category.icon} />
            </span>
          )}

          <span className={styles.chipSpot}>
            <span className={card.chip}>
              <span className={card.chipIcon}>
                <PrivilegeIcon name={category.icon} />
              </span>
              <span className={card.chipLabel}>{category.chip}</span>
            </span>
          </span>

          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
              <path
                d="M6.5 6.5l11 11M17.5 6.5l-11 11"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          <span className={styles.eyebrow}>{privilegeEyebrow(privilege)}</span>
          <i className={styles.rule} aria-hidden="true" />
          <h2 id={titleId} className={styles.title}>
            {privilege.title}
          </h2>

          {privilege.description && <p className={styles.desc}>{privilege.description}</p>}

          <dl className={styles.facts}>
            {privilege.outlet && (
              <div>
                <dt>Where</dt>
                <dd>{privilege.outlet}</dd>
              </div>
            )}
            {/* The API only sends what this guest's tier is entitled to, so
                this is never "not for you" — it says how exclusive it is. */}
            <div>
              <dt>Available to</dt>
              <dd>{tierLabel(privilege.tiers) || "All members"}</dd>
            </div>
          </dl>

          <Button block onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>,
    host
  );
};
