import { tierName } from "../../utils/format.js";

/*
 * The four glyphs, inline rather than an icon package: four paths cost less
 * than a dependency. Fine single-weight outlines on a 24-box in currentColor,
 * matching the engraved line art of the client's design, so the disc decides
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
 * "Member Privileges" — the programme in four stages, between the gallery and
 * the privilege cards on the guest home screen.
 *
 * Deliberately plain: no card, no photograph, just a heading and a 2x2 list
 * on the page's own ground. Both neighbours are full-bleed imagery, and a
 * third photo card between them (the client's original banner) made the
 * screen one long run of pictures and cost half a phone's height. The icon
 * sits beside its text rather than above it for the same reason.
 *
 * Every number shown is the guest's OWN — the rate their current tier earns at
 * this hotel, and the best share that tier can redeem. A guest reading this
 * and then recording a stay should see the arithmetic match; a generic
 * "up to 30%" that their Silver membership could never reach would be worse
 * than no number at all. `rate`, `cap` and `tier` are therefore optional
 * rather than defaulted: anything a hotel has not configured gets the plain
 * wording, never an invented figure.
 */
export const HowItWorks = ({ rate, cap, tier }) => {
  const level = tier ? tierName(tier) : null;
  const figure = (value) => <b className="font-semibold text-ink">{value}%</b>;

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
      caption: rate ? (
        <>Earn {figure(rate)} back in Billionax Coins</>
      ) : (
        "Earn Billionax Coins with every experience"
      ),
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
      caption: cap ? (
        // Held together so the figure never wraps away from "up to".
        <>
          Enjoy benefits worth <span className="whitespace-nowrap">up to {figure(cap)}</span>
        </>
      ) : (
        "Enjoy benefits on every extra"
      ),
    },
  ];

  return (
    <section className="mt-6" aria-labelledby="member-privileges-heading">
      <span className="kicker">
        {level ? `Billionax ${level}` : "Billionax"}
        {level && <sup className="ml-px text-[0.7em]">™</sup>}
      </span>
      {/* Tracking on the inner span: fonts.css sets letter-spacing on
          `[data-font="LUXE"] h2`, which outranks a utility on the h2. */}
      <h2
        id="member-privileges-heading"
        className="mt-1 font-display text-[21px] font-normal leading-[1.15] text-ink"
      >
        <span className="tracking-[-0.01em]">Member Privileges</span>
      </h2>

      <ol className="m-0 mt-3.5 grid list-none grid-cols-2 gap-x-4 gap-y-3.5 p-0">
        {steps.map((step) => (
          <li key={step.key} className="flex min-w-0 items-start gap-2.5">
            <span className="grid size-9 flex-none place-items-center rounded-full bg-[var(--acc-soft)] text-accent [&>svg]:size-[19px]">
              {step.icon}
            </span>
            <span className="min-w-0 pt-px">
              <b className="block text-[10.5px] font-semibold uppercase leading-[1.3] tracking-[0.12em] text-ink">
                {step.title}
              </b>
              {/* font-size-adjust holds the lowercase at one x-height under
                  every font preset — Inter's is a quarter taller than the
                  default face's. */}
              <span className="mt-0.5 block text-[11.5px] leading-[1.4] text-muted [font-size-adjust:0.5] wrap-anywhere text-pretty">
                {step.caption}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};
