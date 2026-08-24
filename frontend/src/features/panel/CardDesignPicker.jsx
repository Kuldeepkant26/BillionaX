import { useState } from "react";
import { MembershipCard } from "../guest/MembershipCard.jsx";
import { CARD_DESIGNS, CARD_DESIGN_KEYS } from "../guest/cardDesigns/registry.jsx";

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

export const CardDesignPicker = ({ value, onChange }) => {
  // Which tier the previews show. Silver by default because it is the tier
  // most guests are on, so it is the card most of them will actually see.
  const [tier, setTier] = useState("SILVER");

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

      <div className="grid grid-cols-1 gap-4 [@media(min-width:640px)]:grid-cols-2 [@media(min-width:1200px)]:grid-cols-3">
        {CARD_DESIGN_KEYS.map((key) => {
          const design = CARD_DESIGNS[key];
          const active = value === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={active}
              className={`cursor-pointer rounded-token border bg-card p-3 text-left transition-[border-color,box-shadow] duration-150 ${
                active
                  ? "border-[var(--acc)] shadow-[0_0_0_2px_var(--acc)]"
                  : "border-hairline hover:border-[var(--acc)]"
              }`}
            >
              <MembershipCard
                design={key}
                membership={{ ...SAMPLE, tier }}
                guestName="Kuldeep Kant"
                hotelName="Taj Hotel"
              />

              <div className="mt-3 flex items-baseline justify-between gap-2">
                <b className="font-display text-[14px] font-semibold">{design.label}</b>
                {active && (
                  <span className="text-[10px] font-bold uppercase tracking-[.12em] text-[var(--acc)]">
                    In use
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] leading-[1.45] text-muted">{design.note}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};
