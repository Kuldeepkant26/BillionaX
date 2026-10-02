import { Fragment } from "react";
import styles from "./HowItWorks.module.css";

/*
 * The four glyphs, inline rather than an icon package: four paths cost less
 * than a dependency. Drawn on a 24-box in currentColor, so the ring decides
 * their colour and they follow the active accent. The light fills give them
 * the solid, engraved weight of the reference art without a second colour.
 */

/* A palace front under a small crown — the stay itself. */
const HotelIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M9.7 5.6 9.3 3.5l1.3.9L12 2.6l1.4 1.8 1.3-.9-.4 2.1z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinejoin="round"
    />
    <path
      d="M7.2 11V8.9a4.8 2.6 0 0 1 9.6 0V11"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path
      d="M3.4 20.6h17.2M4.6 20.6v-8.2l2.6-1.4h9.6l2.6 1.4v8.2"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.2 20.6v-3.4a1.8 1.8 0 0 1 3.6 0v3.4"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path
      d="M7.2 14v4.2M16.8 14v4.2M12 11.2v1.6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const CoinsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <ellipse
      cx="12"
      cy="6.4"
      rx="6.8"
      ry="2.8"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="M5.2 6.4v3.9c0 1.5 3 2.8 6.8 2.8s6.8-1.3 6.8-2.8V6.4M5.2 10.3v3.9c0 1.5 3 2.8 6.8 2.8s6.8-1.3 6.8-2.8v-3.9M5.2 14.2v3.6c0 1.5 3 2.8 6.8 2.8s6.8-1.3 6.8-2.8v-3.6"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

/* A cloche carried on an open hand — a privilege served. */
const ClocheIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 3.2v1.4M10.9 4h2.2"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
    <path
      d="M5.6 12.4a6.4 6.4 0 0 1 12.8 0z"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M4.2 12.4h15.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <path
      d="M9.2 8.6a3.6 3.6 0 0 1 1.6-1.4"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
    <path
      d="M3.4 17.2c1.5-1 3-1.2 4.5-.7l2.6.9h2.9c.8 0 .8 1.3 0 1.3h-3.1"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.3 18.7h3.4l5.2-2.3c.8-.35 1.5.75.8 1.3l-4.6 3.1c-.6.4-1.2.55-2 .55H6.3l-2.9-1.2"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect
      x="4.2"
      y="11.2"
      width="15.6"
      height="9.4"
      rx="1.2"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <rect
      x="3"
      y="8"
      width="18"
      height="3.2"
      rx="0.9"
      fill="currentColor"
      fillOpacity="0.16"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path d="M12 8v12.6" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M12 8S10.9 3.6 8.7 3.6a2.1 2.1 0 0 0 0 4.2c1 0 3.3.2 3.3.2s2.3-.2 3.3-.2a2.1 2.1 0 1 0 0-4.2C13.1 3.6 12 8 12 8Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The four-stage explainer beneath the gallery on the guest home screen.
 *
 * Every number shown is the guest's OWN — the rate their current tier earns at
 * this hotel, and the best share that tier can redeem. A guest reading this
 * and then recording a stay should see the arithmetic match; a generic
 * "up to 30%" that their Silver membership could never reach would be worse
 * than no number at all.
 *
 * `rate` and `cap` are therefore optional rather than defaulted: a hotel that
 * has not configured them gets the plain wording, never an invented figure.
 *
 * Painted from the theme tokens only, so it is a lit glass panel on the dark
 * theme and a quieter engraved one on the light theme, in whichever accent
 * the main admin picked.
 */
export const HowItWorks = ({ rate, cap }) => {
  const steps = [
    {
      key: "stay",
      icon: <HotelIcon />,
      title: "Stay",
      caption: "Luxury begins with every stay",
    },
    {
      key: "earn",
      icon: <CoinsIcon />,
      title: "Earn",
      caption: rate ? `${rate}% back in Billionax Coins` : "Billionax Coins on every experience",
    },
    {
      key: "unlock",
      icon: <ClocheIcon />,
      title: "Unlock",
      caption: "Dining, wellness & lifestyle privileges",
    },
    {
      key: "elevate",
      icon: <GiftIcon />,
      title: "Elevate",
      // "Up to" is accurate because `cap` is the guest's best REACHABLE rate —
      // the highest their tier gets at any of this hotel's services.
      caption: cap ? "Enjoy benefits worth up to" : "Enjoy benefits on every extra",
      figure: cap ? `${cap}%` : null,
    },
  ];

  return (
    <section className="mt-7" aria-labelledby="how-it-works-heading">
      <header className="flex flex-col items-center text-center">
        <h2 id="how-it-works-heading" className={styles.heading}>
          <span>How Billionax works</span>
        </h2>
        <p className={styles.subheading}>A journey of privileges</p>
      </header>

      <div className={styles.panel}>
        <div className={styles.steps}>
          {steps.map((step, i) => (
            /*
             * Each step and its trailing arrow are siblings in the grid rather
             * than nested, so the arrows land in their own auto-width gutters
             * and the four step columns stay exactly equal.
             */
            <Fragment key={step.key}>
              <div className="flex flex-col items-center text-center min-w-0">
                <span className={styles.ring}>{step.icon}</span>
                <b className={styles.title}>{step.title}</b>
                <span className={styles.rule} aria-hidden="true" />
                <p className={styles.caption}>{step.caption}</p>
                {step.figure && (
                  <>
                    <b className={styles.figure}>{step.figure}</b>
                    <span className={styles.ornament} aria-hidden="true" />
                  </>
                )}
              </div>

              {i < steps.length - 1 && <i className={styles.arrow} aria-hidden="true" />}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};
