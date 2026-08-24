/* eslint-disable react-refresh/only-export-components --
   This module is a REGISTRY, not a component module: it exports a lookup
   table whose values happen to contain render functions. There is no
   component to hot-swap, so the fast-refresh boundary the rule protects
   does not apply. Splitting it would separate each design's art from its
   label and note, which belong together. */
import { PALETTES } from "./palettes.js";
import { ChipMark, NfcMark, Sheen } from "./primitives.jsx";
import { EMBOSS, DEBOSS } from "./tokens.js";
import {
  MetalicaArt,
  BrushedSteelArt,
  OrnamentArt,
  AurumArt,
  FacetArt,
  LedgerArt,
  KeycardArt,
  MonogramArt,
} from "./artwork.jsx";

/**
 * The membership-card design registry.
 *
 * One entry per family. Each `render` receives the same card data and returns
 * the whole card face: artwork plus the five data points that appear on every
 * design (tier, balance, member id, guest name, property).
 *
 * Keys mirror CARD_DESIGNS in the API's constants.js. The main admin stores a
 * key; nothing here is admin-supplied, so no markup crosses the wire.
 *
 * ADDING A DESIGN: add the key in both places, add an entry here, and it shows
 * up in the admin picker automatically — the picker maps over this registry.
 */

export const DEFAULT_CARD_DESIGN = "BRUSHED_STEEL";

const TIER_LABEL = { SILVER: "Silver member", GOLD: "Gold member", PLATINUM: "Platinum member" };

/** Absolute positioning matches the mockup's 380x240 face. */
const pos = (styles) => ({ position: "absolute", ...styles });

/* The blocks below repeat by design: each family positions the same five
   fields differently, and a shared "layout" abstraction would need so many
   overrides that it would be harder to read than the duplication. */

const Balance = ({ coins, className, style }) => (
  <span className={`absolute flex items-baseline gap-2 ${className}`} style={style}>
    <span className="leading-none">{coins}</span>
    <span className="text-[11px] uppercase tracking-[.16em] opacity-70">coins</span>
  </span>
);

export const CARD_DESIGNS = {
  /* ------------------------------- 01 -------------------------------- */
  METALICA: {
    label: "Metálica",
    note: "Matte black with a geometric foil cluster sweeping from the corner.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => (
      <>
        <MetalicaArt tier={tier} />
        <div className="absolute inset-0 p-[22px_24px]" style={{ color: "#efece6" }}>
          <div className="text-[10px] font-bold uppercase tracking-[.26em] opacity-85" style={DEBOSS}>
            {TIER_LABEL[tier]}
          </div>
          <div className="absolute right-6 top-5 text-xs font-extrabold tracking-[.18em]" style={DEBOSS}>
            BILLIONAX
          </div>
          <div className="absolute left-6 top-[38px] text-[10px] uppercase tracking-[.16em] opacity-60">
            {hotelName}
          </div>

          <ChipMark tone="steel" style={pos({ left: 24, top: 102, width: 36, height: 27 })} />
          <NfcMark className="absolute right-6 top-[118px] h-[18px] w-[18px] opacity-70" />

          <Balance
            coins={coins}
            className="left-6 top-[56px] font-sans text-[34px] font-extrabold tracking-[-.02em]"
            style={DEBOSS}
          />
          <div
            className="absolute left-6 top-[140px] font-mono text-[17px] font-medium tracking-[.22em]"
            style={DEBOSS}
          >
            {memberNo}
          </div>
          <div
            className="absolute bottom-5 left-6 text-[11px] font-semibold uppercase tracking-[.18em]"
            style={DEBOSS}
          >
            {guestName}
          </div>
        </div>
        <Sheen />
      </>
    ),
  },

  /* ------------------------------- 02 -------------------------------- */
  BRUSHED_STEEL: {
    label: "Brushed steel",
    note: "Milled metal with a ghost monogram and raised type. The house default.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => (
      <>
        <BrushedSteelArt tier={tier} />
        <div className="absolute inset-0 p-[22px_24px]" style={{ color: PALETTES.BRUSHED_STEEL[tier].ink }}>
          <div className="text-[10px] font-bold uppercase tracking-[.26em] opacity-60" style={EMBOSS}>
            {TIER_LABEL[tier]}
          </div>
          <div className="absolute right-6 top-5 text-xs font-extrabold tracking-[.18em]" style={EMBOSS}>
            BILLIONAX
          </div>

          <NfcMark className="absolute right-6 top-[118px] h-[18px] w-[18px] opacity-70" />

          <Balance
            coins={coins}
            className="left-6 top-16 font-mono text-[30px] font-semibold tracking-[.04em]"
            style={EMBOSS}
          />
          <div
            className="absolute left-6 top-[136px] font-mono text-[20px] font-medium tracking-[.18em]"
            style={EMBOSS}
          >
            {memberNo}
          </div>
          <div
            className="absolute bottom-5 left-6 text-[11px] font-semibold uppercase tracking-[.18em]"
            style={EMBOSS}
          >
            {guestName}
          </div>
          <div className="absolute bottom-5 right-6 text-[10px] uppercase tracking-[.16em] opacity-80">
            {hotelName}
          </div>
        </div>
        <Sheen />
      </>
    ),
  },

  /* ------------------------------- 03 -------------------------------- */
  ORNAMENT: {
    label: "Ornament",
    note: "All-over mosaic tiling, with the numerals on a darkened band.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => (
      <>
        <OrnamentArt tier={tier} />
        <div className="absolute inset-0 p-[22px_24px]" style={{ color: PALETTES.ORNAMENT[tier].ink }}>
          <div className="text-[10px] font-bold uppercase tracking-[.26em] opacity-85" style={EMBOSS}>
            {TIER_LABEL[tier]}
          </div>
          <div className="absolute right-6 top-5 text-xs font-extrabold tracking-[.18em]" style={EMBOSS}>
            BILLIONAX
          </div>

          <ChipMark style={pos({ left: 24, top: 102, width: 36, height: 27 })} />
          <NfcMark rotated className="absolute right-6 top-[118px] h-[18px] w-[18px] opacity-70" />

          <Balance
            coins={coins}
            className="left-6 top-[58px] font-mono text-[30px] font-medium tracking-[.06em]"
            style={EMBOSS}
          />
          <div
            className="absolute left-6 top-[140px] font-mono text-[18px] font-medium tracking-[.22em]"
            style={EMBOSS}
          >
            {memberNo}
          </div>
          <div
            className="absolute bottom-5 left-6 text-[11px] font-semibold uppercase tracking-[.18em]"
            style={EMBOSS}
          >
            {guestName}
          </div>
          <div className="absolute bottom-5 right-6 text-[10px] uppercase tracking-[.16em] opacity-80">
            {hotelName}
          </div>
        </div>
        <Sheen />
      </>
    ),
  },

  /* ------------------------------- 04 -------------------------------- */
  AURUM: {
    label: "Aurum",
    note: "Black body with a metal hairline frame and a crest, tier named top-right.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => {
      const c = PALETTES.AURUM[tier];
      return (
        <>
          <AurumArt tier={tier} />
          <div className="absolute inset-0 p-[22px_24px]" style={{ color: c.acc }}>
            <div className="absolute left-6 top-[18px] flex items-center gap-2.5">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke={c.acc} strokeWidth="1.4" aria-hidden="true">
                <path d="M13 2l10 6v10l-10 6-10-6V8z" />
                <path d="M13 8l5 3v6l-5 3-5-3v-6z" fill={c.acc} fillOpacity=".25" />
              </svg>
              <div className="text-[9px] font-bold uppercase leading-[1.45] tracking-[.2em]">
                Billionax
                <br />
                <span className="font-medium opacity-60">Rewards</span>
              </div>
            </div>

            <div className="absolute right-6 top-[22px] text-xs font-extrabold tracking-[.18em]">
              {tier}
            </div>

            <ChipMark style={pos({ left: 24, top: 54, width: 40, height: 30 })} />
            <div className="absolute left-[76px] top-[61px] text-[10px] uppercase tracking-[.24em] opacity-65">
              {hotelName}
            </div>

            <Balance
              coins={coins}
              className="left-6 top-[98px] font-mono text-[28px] font-medium tracking-[.1em]"
              style={EMBOSS}
            />
            <div
              className="absolute left-6 top-[146px] font-mono text-[15px] font-medium tracking-[.28em]"
              style={EMBOSS}
            >
              {memberNo}
            </div>
            <div
              className="absolute bottom-[18px] left-6 text-[11px] font-semibold uppercase tracking-[.18em]"
              style={EMBOSS}
            >
              {guestName}
            </div>
            <div className="absolute bottom-5 right-6 font-display text-[15px] font-bold tracking-[.06em]">
              Billionax
            </div>
          </div>
          <Sheen />
        </>
      );
    },
  },

  /* ------------------------------- 05 -------------------------------- */
  FACET: {
    label: "Facet",
    note: "Low-poly crystal. Each tier is its own stone: hematite, citrine, obsidian.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => (
      <>
        <FacetArt tier={tier} />
        <div className="absolute inset-0 p-[22px_24px] text-white">
          <div className="text-[10px] font-bold uppercase tracking-[.26em] opacity-85" style={DEBOSS}>
            {TIER_LABEL[tier]}
          </div>
          <div className="absolute right-6 top-5 text-xs font-extrabold tracking-[.18em]" style={DEBOSS}>
            BILLIONAX
          </div>

          <ChipMark style={pos({ left: 24, top: 104, width: 36, height: 27 })} />
          <NfcMark className="absolute right-6 top-[118px] h-[18px] w-[18px] opacity-70" />

          <Balance
            coins={coins}
            className="left-6 top-[58px] text-[40px] font-medium"
            style={{ ...DEBOSS, fontFamily: "var(--font-display)" }}
          />
          <div
            className="absolute left-6 top-[146px] font-mono text-[16px] font-medium tracking-[.22em]"
            style={DEBOSS}
          >
            {memberNo}
          </div>
          <div
            className="absolute bottom-5 left-6 text-[11px] font-semibold uppercase tracking-[.18em]"
            style={DEBOSS}
          >
            {guestName}
          </div>
          <div className="absolute bottom-5 right-6 text-[10px] uppercase tracking-[.16em] opacity-80">
            {hotelName}
          </div>
        </div>
        <Sheen />
      </>
    ),
  },

  /* ------------------------------- 06 -------------------------------- */
  LEDGER: {
    label: "Ledger",
    note: "Banknote guilloché with a ring seal. Quiet and institutional.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => {
      const c = PALETTES.LEDGER[tier];
      return (
        <>
          <LedgerArt tier={tier} />
          <div className="absolute inset-0 p-[22px_24px]" style={{ color: "#f1ede4" }}>
            <div className="text-[10px] font-bold uppercase tracking-[.26em] opacity-85">
              {TIER_LABEL[tier]}
            </div>
            <div className="absolute right-6 top-5 font-display text-[15px] font-bold tracking-[.12em]">
              BILLIONAX
            </div>
            <div
              className="absolute right-6 top-[52px] text-[9px] uppercase tracking-[.3em] opacity-55"
              style={{ color: c.acc }}
            >
              Est. MMXXVI
            </div>

            <Balance
              coins={coins}
              className="left-6 top-[70px] font-display text-[48px] font-medium tracking-[-.01em]"
            />
            <div className="absolute left-6 top-[142px] font-mono text-[15px] font-medium tracking-[.3em] opacity-90">
              {memberNo}
            </div>
            <div className="absolute bottom-5 left-6 text-[11px] font-semibold uppercase tracking-[.18em]">
              {guestName}
            </div>
            <div className="absolute bottom-5 right-6 text-[10px] uppercase tracking-[.16em] opacity-80">
              {hotelName}
            </div>
          </div>
          <Sheen />
        </>
      );
    },
  },

  /* ------------------------------- 07 -------------------------------- */
  KEYCARD: {
    label: "Keycard",
    note: "The room key itself: paper stock, a spine band, letterpress numerals.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => {
      const c = PALETTES.KEYCARD[tier];
      return (
        <>
          <KeycardArt tier={tier} />
          <div className="absolute inset-0 p-[22px_24px]" style={{ color: c.ink }}>
            <div className="absolute left-9 top-[22px] text-[10px] font-bold uppercase tracking-[.26em] opacity-85">
              {TIER_LABEL[tier]}
            </div>
            <div
              className="absolute right-6 top-5 text-[16px] font-bold tracking-[.1em]"
              style={{ color: c.band, fontFamily: "var(--font-display)" }}
            >
              Billionax
            </div>

            <Balance
              coins={coins}
              className="left-9 top-[72px] text-[46px] font-bold tracking-[-.02em]"
              style={{ fontFamily: "var(--font-display)" }}
            />
            <div className="absolute left-9 top-[140px] font-mono text-[15px] font-medium tracking-[.28em]">
              {memberNo}
            </div>
            <div className="absolute bottom-5 left-9 text-[11px] font-semibold uppercase tracking-[.18em]">
              {guestName}
            </div>
            <div className="absolute bottom-5 right-6 text-[10px] uppercase tracking-[.16em]">
              {hotelName}
            </div>
          </div>
          {/* The coloured spine, which is what makes it read as a key card. */}
          <span className="absolute bottom-0 left-0 top-0 w-3" style={{ background: c.band }} aria-hidden="true" />
          <Sheen />
        </>
      );
    },
  },

  /* ------------------------------- 08 -------------------------------- */
  MONOGRAM: {
    label: "Monogram",
    note: "Deep navy with the property's initial outlined large. Differs per hotel.",
    render: ({ tier, coins, memberNo, guestName, hotelName }) => {
      const c = PALETTES.MONOGRAM[tier];
      // The initial is the property's, so each partner's card differs.
      const initial = (hotelName || "B").trim().charAt(0).toUpperCase() || "B";

      return (
        <>
          <MonogramArt tier={tier} initial={initial} />
          <div className="absolute inset-0 p-[22px_24px]" style={{ color: "#f0eee8" }}>
            <div
              className="text-[10px] font-bold uppercase tracking-[.26em]"
              style={{ color: c.acc }}
            >
              {TIER_LABEL[tier]}
            </div>
            <div
              className="absolute right-6 top-5 font-display text-[15px] font-bold tracking-[.12em]"
              style={{ color: c.acc }}
            >
              BILLIONAX
            </div>

            <Balance coins={coins} className="left-6 top-16 font-display text-[44px] font-semibold" />
            <div className="absolute left-6 top-[142px] font-mono text-[15px] font-medium tracking-[.28em]">
              {memberNo}
            </div>
            <div className="absolute bottom-5 left-6 text-[11px] font-semibold uppercase tracking-[.18em]">
              {guestName}
            </div>
            <div className="absolute bottom-5 right-6 text-[10px] uppercase tracking-[.16em] opacity-80">
              {hotelName}
            </div>
          </div>
          <Sheen />
        </>
      );
    },
  },
};

export const CARD_DESIGN_KEYS = Object.keys(CARD_DESIGNS);

/**
 * Resolves a stored key to a design, falling back rather than throwing.
 *
 * An unknown key is normal, not exceptional: the API may have been given a
 * design this build does not ship yet (or one that was removed). Falling back
 * shows the default card instead of crashing the guest's home screen.
 */
export const resolveCardDesign = (key) =>
  CARD_DESIGNS[key] || CARD_DESIGNS[DEFAULT_CARD_DESIGN];
