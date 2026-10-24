import { tierName } from "../../utils/format.js";
import lounge from "../../assets/member-lounge.jpg";
import styles from "./HowItWorks.module.css";

/*
 * The four glyphs, inline rather than an icon package: four paths cost less
 * than a dependency. Fine single-weight outlines on a 24-box in currentColor,
 * matching the engraved line art of the client's design, so the ring decides
 * their colour and they follow the active accent.
 */

const glyph = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

/* A bed seen from the foot: headboard, two pillows, mattress, legs. */
const BedIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...glyph}>
    <path d="M5 11.2V6.8A1.6 1.6 0 0 1 6.6 5.2h10.8A1.6 1.6 0 0 1 19 6.8v4.4" />
    <path d="M7.2 11.2V9.6a.9.9 0 0 1 .9-.9h2.6a.9.9 0 0 1 .9.9v1.6M12.4 11.2V9.6a.9.9 0 0 1 .9-.9h2.6a.9.9 0 0 1 .9.9v1.6" />
    <path d="M3.6 17.6v-5.1a1.3 1.3 0 0 1 1.3-1.3h14.2a1.3 1.3 0 0 1 1.3 1.3v5.1zM3.6 15.2h16.8" />
    <path d="M5 17.6v1.6M19 17.6v1.6" />
  </svg>
);

/* A short stack of coins. */
const CoinsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...glyph}>
    <ellipse cx="12" cy="6.4" rx="6.6" ry="2.7" />
    <path d="M5.4 6.4v3.8c0 1.5 3 2.7 6.6 2.7s6.6-1.2 6.6-2.7V6.4M5.4 10.2v3.8c0 1.5 3 2.7 6.6 2.7s6.6-1.2 6.6-2.7v-3.8M5.4 14v3.6c0 1.5 3 2.7 6.6 2.7s6.6-1.2 6.6-2.7V14" />
  </svg>
);

/* A cloche on its tray — a privilege served. */
const ClocheIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...glyph}>
    <path d="M12 5.6V7.4M10.7 5.6h2.6" />
    <path d="M5.2 15.6a6.8 6.8 0 0 1 13.6 0" />
    <path d="M3.6 15.6h16.8M6.8 18.4h10.4" />
    <path d="M8.7 12.4a3.8 3.8 0 0 1 2-2.3" />
  </svg>
);

const GiftIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...glyph}>
    <rect x="4.4" y="11.2" width="15.2" height="9.2" rx="1.1" />
    <rect x="3.2" y="8" width="17.6" height="3.2" rx="0.9" />
    <path d="M12 8v12.4" />
    <path d="M12 8S10.9 3.6 8.7 3.6a2.1 2.1 0 0 0 0 4.2c1 0 3.3.2 3.3.2s2.3-.2 3.3-.2a2.1 2.1 0 1 0 0-4.2C13.1 3.6 12 8 12 8Z" />
  </svg>
);

/**
 * "Member Privileges" — the client's banner explaining the programme in four
 * stages, beneath the gallery on the guest home screen.
 *
 * The client's design is a wide desktop banner; the guest shell is never wider
 * than 460px, so it is set at phone scale: the photograph and the copy across
 * the top, and the four stages as a 2x2 block rather than one row of columns
 * too narrow to hold a sentence.
 *
 * Every number shown is the guest's OWN — the rate their current tier earns at
 * this hotel, and the best share that tier can redeem. A guest reading this
 * and then recording a stay should see the arithmetic match; a generic
 * "up to 30%" that their Silver membership could never reach would be worse
 * than no number at all. `rate`, `cap` and `tier` are therefore optional
 * rather than defaulted: anything a hotel has not configured gets the plain
 * wording, never an invented figure.
 *
 * Imagery, like the membership and privilege cards, so it keeps its own dark
 * ground in both guest themes; its gold is the network accent, lifted to read
 * on black.
 */
export const HowItWorks = ({ rate, cap, tier }) => {
  const level = tier ? tierName(tier) : null;
  const programme = level ? `Billionax ${level}` : "Billionax";

  const steps = [
    {
      key: "stay",
      icon: <BedIcon />,
      title: "Stay",
      caption: "Luxury begins with every stay",
    },
    {
      key: "earn",
      icon: <CoinsIcon />,
      title: "Earn",
      caption: rate
        ? `Earn ${rate}% back in Billionax Coins`
        : "Earn Billionax Coins with every experience",
    },
    {
      key: "unlock",
      icon: <ClocheIcon />,
      title: "Unlock",
      caption: "Access dining, wellness & lifestyle privileges",
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
    <section className={styles.banner} aria-labelledby="member-privileges-heading">
      <img className={styles.photo} src={lounge} alt="" loading="lazy" decoding="async" />
      <span className={styles.scrim} aria-hidden="true" />

      <header className={styles.hero}>
        <span className={styles.eyebrow}>
          <span>
            {programme}
            {level && <sup>™</sup>}
          </span>
        </span>
        <h2 id="member-privileges-heading" className={styles.title}>
          <span>Member Privileges</span>
        </h2>
        {/* Two sentences on their own lines, as in the reference — run
            together they wrapped to leave "a lifestyle." orphaned. */}
        <p className={styles.lede}>
          <span>Curated exclusively for {programme} Members.</span>
          <span>More than benefits — it&rsquo;s a lifestyle.</span>
        </p>
      </header>

      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.key} className={styles.step}>
            <span className={styles.ringRow}>
              <span className={styles.ring}>{step.icon}</span>
            </span>
            <b className={styles.stepTitle}>{step.title}</b>
            <p className={styles.caption}>{step.caption}</p>
            {step.figure && <b className={styles.figure}>{step.figure}</b>}
          </li>
        ))}
      </ol>
    </section>
  );
};
