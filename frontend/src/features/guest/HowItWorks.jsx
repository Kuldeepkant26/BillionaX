import { Fragment } from "react";
import styles from "./HowItWorks.module.css";

/*
 * The four glyphs, inline rather than an icon package: four paths cost less
 * than a dependency, and drawing them here lets each one sit on the same
 * 24-box optical grid as the quick-action icons above.
 */
const HotelIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <path
      d="M4 20V9.6L12 4l8 5.6V20"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="M2.6 20h18.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <rect x="8.4" y="10.8" width="2.6" height="2.6" stroke="currentColor" strokeWidth="1.4" />
    <path d="M10.2 20v-3.6h3.6V20" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const CoinsIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <ellipse cx="12" cy="7.2" rx="6.6" ry="2.9" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.4 7.2v4.2c0 1.6 3 2.9 6.6 2.9s6.6-1.3 6.6-2.9V7.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M5.4 11.4v4.2c0 1.6 3 2.9 6.6 2.9s6.6-1.3 6.6-2.9v-4.2" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

/* A coin dropping into an open palm — the moment of redeeming. */
const RedeemIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <circle cx="12" cy="6.6" r="3.9" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 4.9v3.4M10.6 7l1.4 1.3L13.4 7"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.4 14.6c1.9-.9 3.6-.6 5 .8l1.5 1.5h2.6c.9 0 .9 1.4 0 1.4h-3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M9.9 18.3h3.6l6-2.4c.9-.35 1.6.9.8 1.5l-5.4 3.4c-.7.45-1.3.6-2.2.6H3.4"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
    <rect x="3.4" y="9.6" width="17.2" height="10.8" rx="1.4" stroke="currentColor" strokeWidth="1.6" />
    <path d="M2.6 9.6h18.8v3.4H2.6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M12 9.6v10.8" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M12 9.6S10.9 4.8 8.6 4.8a2 2 0 0 0 0 4c1 0 3.4.8 3.4.8s2.4-.8 3.4-.8a2 2 0 1 0 0-4C13.1 4.8 12 9.6 12 9.6Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * The four-stage explainer beneath the gallery on the guest home screen.
 *
 * Every number shown is the guest's OWN — the rate their current tier earns at
 * this hotel, and the typical share that tier can redeem. A guest reading this
 * and then recording a stay should see the arithmetic match; a generic
 * "up to 30%" that their Silver membership could never reach would be worse
 * than no number at all.
 *
 * `rate` and `cap` are therefore optional rather than defaulted: a hotel that
 * has not configured them gets the plain wording, never an invented figure.
 *
 * Four columns of icon, label and value, and nothing else. The tier footnote
 * and the per-step captions that used to sit here were explaining an explainer
 * — the icons and the numbers already carry it, and the guest's tier and
 * property are both on the card above.
 */
export const HowItWorks = ({ rate, cap }) => {
  const steps = [
    {
      key: "stay",
      icon: <HotelIcon />,
      label: "Stay at",
      // The generic noun, not the hotel's name: a long name wrapped onto three
      // lines in a ~70px column and pushed the whole row out of shape, and the
      // guest is already looking at the property they picked.
      detail: "Hotel",
    },
    {
      key: "earn",
      icon: <CoinsIcon />,
      label: "Earn",
      detail: rate ? `${rate}% back` : "coins back",
    },
    {
      key: "redeem",
      icon: <RedeemIcon />,
      label: "Redeem at",
      detail: "the hotel",
    },
    {
      key: "reward",
      icon: <GiftIcon />,
      // "Typically", not "up to": each outlet sets its own share now, so a
      // hotel may allow more at the restaurant than this and nothing at the
      // spa. The tier rate is still what an untagged line prices at, which is
      // what makes it the honest typical figure rather than a ceiling.
      // One word, like the other three labels. "Typically save" wrapped onto
      // two lines in a ~70px column and pushed this step's number below its
      // neighbours', which made the row look misaligned rather than emphatic.
      label: "Save",
      detail: cap ? `${cap}%` : "on extras",
      payoff: true,
    },
  ];

  return (
    <section className="mt-6" aria-labelledby="how-it-works-heading">
      <span className="kicker" id="how-it-works-heading">
        How Billionax coins work
      </span>

      <div className="bg-card border border-hairline rounded-token mt-2.5 px-3 py-[18px]">
        <div className={styles.steps}>
          {steps.map((step, i) => (
            /*
             * Each step and its trailing arrow are siblings in the grid rather
             * than nested, so the arrows land in their own auto-width gutters
             * and the four step columns stay exactly equal.
             */
            <Fragment key={step.key}>
              <div className="flex flex-col items-center text-center px-0.5">
                <span
                  className={`w-11 h-11 rounded-full grid place-items-center flex-none ${
                    step.payoff ? styles.ringPayoff : styles.ring
                  }`}
                >
                  {step.icon}
                </span>
                <u className="block no-underline text-[9.5px] text-muted tracking-[0.07em] uppercase mt-2.5 leading-[1.3]">
                  {step.label}
                </u>
                {/* A hotel name can be long and the column is ~70px on a
                    phone, so a word too wide to fit breaks rather than
                    spilling past the arrow into its neighbour. */}
                <b className="block font-display text-[13px] font-semibold leading-[1.25] mt-[3px] tracking-[-0.2px] wrap-anywhere">
                  {step.detail}
                </b>
              </div>

              {i < steps.length - 1 && <i className={styles.arrow} aria-hidden="true" />}
            </Fragment>
          ))}
        </div>

      </div>
    </section>
  );
};
