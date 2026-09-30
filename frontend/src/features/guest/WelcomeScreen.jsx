import styles from "./WelcomeScreen.module.css";

/**
 * The first thing a guest sees on /login and /join/:slug: the brand, the
 * promise, and one "Get started" action that leads to the sign-in form.
 *
 * PRESENTATION ONLY. It owns no state and knows nothing about the OTP flow —
 * JoinPage renders it, supplies the action, and decides when to move on. That
 * keeps the one unauthenticated write path in the app in exactly one file.
 *
 * The scene is drawn rather than photographed: it paints from the network
 * accent, so the same screen is gold on Champagne and coral on Coral, and it
 * costs no image download on a phone at a reception desk.
 */

/*
 * The skyline behind the window, built once at module load.
 *
 * Seeded, not Math.random(): the city has to be the same city on every render
 * and every device, or it reshuffles each time the guest comes back to this
 * screen. The numbers are in the SVG's own 400x160 box.
 */
const SKYLINE = (() => {
  let seed = 20260930;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const far = [];
  for (let x = -6; x < 406; ) {
    const w = 9 + rand() * 16;
    // An occasional tower, so the far line has the peaks a real skyline has.
    const h = rand() > 0.86 ? 92 + rand() * 38 : 34 + rand() * 46;
    far.push({ x, w, h });
    x += w + rand() * 2;
  }

  const near = [];
  const lights = [];
  for (let x = -8; x < 408; ) {
    const w = 13 + rand() * 20;
    const h = rand() > 0.82 ? 70 + rand() * 30 : 18 + rand() * 40;
    near.push({ x, w, h });

    // Lit windows on a coarse grid. Most are dark — a fully lit tower reads as
    // a pattern, not a city at dusk.
    for (let wy = 160 - h + 5; wy < 156; wy += 5.5) {
      for (let wx = x + 2.5; wx < x + w - 3; wx += 4.2) {
        if (rand() > 0.66) lights.push({ x: wx, y: wy, o: 0.35 + rand() * 0.6 });
      }
    }
    x += w + 0.8 + rand() * 3;
  }

  return { far, near, lights };
})();

/* The fine guilloché on the card face: a fan of curves that pinch together
   towards the middle, like the engraving on a metal card. */
const CARD_WAVES = Array.from({ length: 16 }, (_, i) => {
  const t = i / 15;
  const y0 = 30 + t * 44;
  const y1 = 88 - t * 40;
  return `M-4 ${y0.toFixed(1)} C 50 ${(y0 - 30).toFixed(1)}, 92 ${(y1 + 34).toFixed(1)}, 164 ${y1.toFixed(1)}`;
});

/* Veins in the marble. Hand-placed: generated ones never look like stone. */
const VEINS = [
  "M-10 48 C 40 40, 70 62, 120 52 S 210 30, 260 44 S 340 70, 410 50",
  "M-10 86 C 30 80, 60 96, 110 90 S 190 70, 240 84",
  "M150 120 C 190 104, 230 116, 280 100 S 360 92, 410 108",
  "M30 140 C 70 124, 90 132, 130 118",
  "M260 60 C 280 72, 300 70, 330 84 S 380 96, 410 90",
];

/*
 * Icons. Hand-written paths on a 20x20 box, matching the rest of the app —
 * there is no icon library in the bundle.
 */
const HotelIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M4.2 17.4V3.9a.6.6 0 0 1 .6-.6h7.2a.6.6 0 0 1 .6.6v13.5M12.6 7.6h3.2a.6.6 0 0 1 .6.6v9.2M2.6 17.4h14.8M7.8 17.4v-2.8h2.4v2.8"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6.8 6.2h.9M9.4 6.2h.9M6.8 8.8h.9M9.4 8.8h.9M6.8 11.4h.9M9.4 11.4h.9M14.2 10.6h.3M14.2 13.2h.3"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

const DiamondIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M5.8 3.6h8.4l3.2 4.2L10 16.6 2.6 7.8zM2.6 7.8h14.8M7.7 3.6 6.5 7.8 10 16.6l3.5-8.8-1.2-4.2"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

const CoinsIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <ellipse cx="10" cy="5.2" rx="5.6" ry="2.1" stroke="currentColor" strokeWidth="1.2" />
    <path
      d="M4.4 5.2v3c0 1.2 2.5 2.1 5.6 2.1s5.6-.9 5.6-2.1v-3M4.4 8.2v3c0 1.2 2.5 2.1 5.6 2.1s5.6-.9 5.6-2.1v-3M4.4 11.2v3c0 1.2 2.5 2.1 5.6 2.1s5.6-.9 5.6-2.1v-3"
      stroke="currentColor"
      strokeWidth="1.2"
    />
  </svg>
);

const SparkleIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path
      d="M9.4 2.6c.6 3.8 2.5 5.7 6.3 6.3-3.8.6-5.7 2.5-6.3 6.3-.6-3.8-2.5-5.7-6.3-6.3 3.8-.6 5.7-2.5 6.3-6.3zM15.4 13.4c.2 1.1.8 1.7 1.9 1.9-1.1.2-1.7.8-1.9 1.9-.2-1.1-.8-1.7-1.9-1.9 1.1-.2 1.7-.8 1.9-1.9z"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

const FEATURES = [
  { label: ["Premium", "hotels"], Icon: HotelIcon },
  { label: ["Exclusive", "offers"], Icon: DiamondIcon },
  { label: ["Billionax", "coins"], Icon: CoinsIcon },
  { label: ["Curated", "experiences"], Icon: SparkleIcon },
];

/** One membership card. The back card is the same card, set further away. */
const SceneCard = ({ className }) => (
  <div className={`${styles.card} ${className}`}>
    <svg className={styles.cardWaves} viewBox="0 0 160 101" preserveAspectRatio="none">
      {CARD_WAVES.map((d, i) => (
        <path key={i} d={d} style={{ opacity: 0.18 + (i % 5) * 0.09 }} />
      ))}
    </svg>
    <span className={styles.cardName}>Billionax</span>
    <img src="/logo.png" alt="" className={styles.cardMark} />
  </div>
);

/**
 * A suite at dusk: curtain, window, the city beyond, and two membership cards
 * resting on a marble table. Decorative — aria-hidden, no pointer events.
 */
const WelcomeScene = () => (
  <div className={styles.scene} aria-hidden="true">
    <span className={styles.sky} />

    <svg className={styles.skyline} viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice">
      <g className={styles.far}>
        {SKYLINE.far.map((b, i) => (
          <rect key={i} x={b.x} y={160 - b.h} width={b.w} height={b.h} />
        ))}
      </g>
      <g className={styles.near}>
        {SKYLINE.near.map((b, i) => (
          <rect key={i} x={b.x} y={160 - b.h} width={b.w} height={b.h} />
        ))}
      </g>
      <g className={styles.lights}>
        {SKYLINE.lights.map((l, i) => (
          <rect key={i} x={l.x} y={l.y} width="1.7" height="1.3" opacity={l.o} />
        ))}
      </g>
    </svg>

    <span className={styles.frame} />
    <span className={styles.curtain} />

    <div className={styles.table}>
      <svg className={styles.veins} viewBox="0 0 400 160" preserveAspectRatio="none">
        {VEINS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </svg>
    </div>

    <div className={styles.cards}>
      <span className={styles.cardShadow} />
      <SceneCard className={styles.cardBack} />
      <SceneCard className={styles.cardFront} />
    </div>
  </div>
);

/**
 * @param hotel   the property when the guest arrived by QR, else null
 * @param action  the call to action, supplied by JoinPage so this screen never
 *                has to know what "getting started" involves
 */
export const WelcomeScreen = ({ hotel, action }) => (
  <section className="flex flex-col flex-1 min-h-svh">
    <header className="flex items-center gap-3.5 px-6 pt-8">
      <img src="/logo.png" alt="" className="w-11 h-11 object-contain brightness-135" />
      <span className={styles.wordmark}>Billionax</span>
    </header>

    <div className="relative z-1 px-6 pt-12">
      {/* A QR guest is told where they are before anything else — it is the
          one piece of context that makes the promise below concrete. */}
      <p className={styles.kicker}>{hotel ? `Welcome to ${hotel.name}` : "More than a stay"}</p>
      <h1 className={styles.title}>
        It&rsquo;s a world of <em>privileges.</em>
      </h1>
      <p className={styles.sub}>
        Unlock exclusive experiences, earn Billionax Coins and make every stay more rewarding.
      </p>
      <span className={styles.rule} />
    </div>

    <WelcomeScene />

    <ul className={styles.features}>
      {FEATURES.map(({ label, Icon }) => (
        <li key={label.join(" ")} className={styles.feature}>
          <Icon />
          <span>
            {label[0]}
            <br />
            {label[1]}
          </span>
        </li>
      ))}
    </ul>

    <p className={`${styles.tagline} px-6 pt-8`}>
      Luxury isn&rsquo;t a place,
      <br />
      it&rsquo;s a feeling.
    </p>

    {/* Docked to the bottom edge: the screen is a tall poster, and on a phone
        with the browser's toolbars showing the action would otherwise start
        below the fold. */}
    <div className={styles.dock}>{action}</div>
  </section>
);
