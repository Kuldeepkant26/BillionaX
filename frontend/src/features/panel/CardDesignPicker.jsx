import { useEffect, useRef, useState } from "react";
import { MembershipCard } from "../guest/MembershipCard.jsx";
import { CARD_DESIGNS, CARD_CATEGORY_GROUPS } from "../guest/cardDesigns/registry.jsx";
import styles from "./CardDesignPicker.module.css";

/** The width every card design is laid out against. */
const DESIGN_WIDTH = 380;

/**
 * Picks the membership-card art used across the whole network.
 *
 * Previews are the REAL card component, not screenshots — so what the admin
 * approves is exactly what guests get, and a design that breaks cannot ship
 * looking fine here. Sample data only: no guest's actual balance is shown.
 */

const SAMPLE = { balance: 5100, memberNo: "GW-TAJ-3E0832" };
const TIERS = ["SILVER", "GOLD", "PLATINUM"];
const TIER_LABEL = { SILVER: "Silver", GOLD: "Gold", PLATINUM: "Platinum" };

/**
 * The factor that fits a 380px card into the tile it is rendered in.
 *
 * Measured rather than expressed in CSS because `transform: scale()` needs a
 * unitless number, and neither `calc()` on two lengths nor `cqw` units can
 * produce one. One observer on the grid covers every tile — they are all the
 * same width.
 */
const useCardScale = () => {
  const ref = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setScale(width / DESIGN_WIDTH);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, scale];
};

export const CardDesignPicker = ({ value, onChange }) => {
  // Which tier the previews show. Silver by default because it is the tier
  // most guests are on, so it is the card most of them will actually see.
  const [tier, setTier] = useState("SILVER");
  const [scaleRef, scale] = useCardScale();

  return (
    <div>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-xs leading-[1.5] text-muted">
          Applies to every hotel on the network. Guests see the change the next time their app
          loads. Previews use sample data.
        </p>

        {/* Tier switch: the art differs per tier, so approving a family means
            seeing all three, not just one. */}
        <div className="flex gap-1.5 rounded-full bg-chip p-1" role="group" aria-label="Preview tier">
          {TIERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTier(t)}
              aria-pressed={tier === t}
              className={`cursor-pointer rounded-full border-0 px-3 py-1.5 font-[inherit] text-[12px] font-semibold transition-[background,color] duration-150 ${
                tier === t ? "bg-surface text-ink shadow-[var(--shadow-sm)]" : "bg-transparent text-muted"
              }`}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped into sections rather than one flat grid: at 20 designs the
          flat list gave no way to narrow the choice, and the families are how
          people actually decide — "something metal", "something with the
          logo" — before comparing individual cards.

          Denser than the previews used to be: at three-up the cards were far
          larger than they need to be to judge the art, and the grid pushed
          everything below it off the screen.

          Native md/lg/2xl prefixes, not [@media(...)] arbitrary variants:
          Tailwind sorts arbitrary variants as strings, so "1100" would sort
          before "760" and the smaller breakpoint would win at every width. */}
      {CARD_CATEGORY_GROUPS.map((group, groupIndex) => (
        <section key={group.key} className="mb-5 last:mb-0">
          <div className="mb-2.5">
            <b className="font-display text-[13.5px] font-semibold">{group.label}</b>
            <p className="mt-0.5 max-w-[62ch] text-[11.5px] leading-[1.5] text-muted">
              {group.note}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {group.keys.map((key, index) => {
              const design = CARD_DESIGNS[key];
              const active = value === key;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChange(key)}
                  aria-pressed={active}
                  title={design.note}
                  className={`cursor-pointer rounded-token border bg-card p-2 text-left transition-[border-color,box-shadow] duration-150 ${
                    active
                      ? "border-[var(--acc)] shadow-[0_0_0_2px_var(--acc)]"
                      : "border-hairline hover:border-[var(--acc)]"
                  }`}
                >
                  {/* The card art is laid out in fixed pixels against a 380px
                      card (see cardDesigns/registry.jsx), so a narrower box
                      would overflow its text. Render at the design width and
                      scale the whole card down, which keeps every design
                      pixel-accurate to what guests actually see.

                      The measured tile is the first one of the FIRST section:
                      every section uses the same grid, so one observer covers
                      them all. */}
                  <span
                    ref={groupIndex === 0 && index === 0 ? scaleRef : undefined}
                    className={styles.scaler}
                  >
                    <span className={styles.card} style={{ "--card-scale": scale }}>
                      <MembershipCard
                        design={key}
                        membership={{ ...SAMPLE, tier }}
                        guestName="Kuldeep Kant"
                        hotelName="Taj Hotel"
                      />
                    </span>
                  </span>

                  <div className="mt-2 flex items-baseline justify-between gap-1.5">
                    <b className="truncate font-display text-[12.5px] font-semibold">
                      {design.label}
                    </b>
                    {active && (
                      <span className="text-[9px] font-bold uppercase tracking-[.1em] text-[var(--acc)]">
                        On
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
