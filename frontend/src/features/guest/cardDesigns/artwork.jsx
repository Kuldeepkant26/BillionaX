import { PALETTES } from "./palettes.js";
import { useSvgIds } from "./tokens.js";
import { ringAndBar } from "./primitives.jsx";

/**
 * The background artwork for each family: everything behind the text.
 *
 * Each component takes a tier and paints one 380x240 SVG that stretches to the
 * card. They are pure — no data, no layout — so the same art serves the guest
 * card and the admin's picker without either knowing about the other.
 */

/**
 * The Billionax mark at a given centre and radius, for stroking.
 *
 * A thin re-export of primitives.jsx's ringAndBar, kept as its own name here
 * because every design below calls it as "the mark", not "the ring and bar" —
 * see ringAndBar for the actual geometry, including the two short breaks
 * where the bar crosses the ring, cut with a mask rather than redrawn as a
 * plain, gapless circle.
 */
const markPaths = ringAndBar;

/* ---------------- 01 Metálica: foil geometry on matte black --------------- */

// Hand-placed marks from the mockup. A data blob, not logic: kept as one array
// so the cluster can be retuned without touching the component.
const TRIBAL_MARKS = [
  "M330 170h14v14h-14z", "M350 172l9-12 9 12z", "M372 160a7 7 0 1 0 .1 0z",
  "M392 168h10v3h-10zM392 174h10v3h-10zM392 180h10v3h-10z", "M312 192l6-9 6 9-6 9z",
  "M332 196h12v3h-12zM332 202h12v3h-12z", "M352 192a8 8 0 1 0 .1 0zM356 196a4 4 0 1 1-.1 0z",
  "M372 190h12l-6 10z", "M292 206h8v8h-8zM302 206h8v8h-8z", "M318 212l5-7 5 7-5 7z",
  "M340 212h16v2h-16zM340 216h16v2h-16zM340 220h16v2h-16z", "M364 210a6 6 0 1 0 .1 0z",
  "M380 206l14 0-7 12z", "M270 222h10v10h-10z", "M286 228l6-8 6 8z", "M304 226h14v3h-14z",
  "M324 224a5 5 0 1 0 .1 0z", "M338 228h8v8h-8z", "M352 230l10-8v16z",
  "M368 226h12v2h-12zM368 231h12v2h-12z", "M250 236l8 0-4 8z", "M262 240h10v2h-10z",
  "M278 238a4 4 0 1 0 .1 0z", "M292 240h8v6h-8z", "M306 242l5-6 5 6z", "M320 240h14v2h-14z",
  "M340 244a5 5 0 1 0 .1 0z", "M356 240h10v6h-10z", "M372 242l8-6v12z",
];

export const MetalicaArt = ({ tier }) => {
  const c = PALETTES.METALICA[tier];
  const id = useSvgIds("foil", "fade", "mask");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.foil} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={c.foilB} />
          <stop offset=".45" stopColor={c.foilA} />
          <stop offset=".6" stopColor={c.foilC} />
          <stop offset="1" stopColor={c.foilB} />
        </linearGradient>
        {/* Fades the cluster out to the left so it reads as lit from one side. */}
        <linearGradient id={id.fade} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity=".15" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={id.mask}>
          <rect width="380" height="240" fill={`url(#${id.fade})`} />
        </mask>
      </defs>

      <rect width="380" height="240" fill={c.base} />
      <g
        fill={`url(#${id.foil})`}
        mask={`url(#${id.mask})`}
        transform="translate(402 250) scale(1.55) translate(-402 -250)"
      >
        {TRIBAL_MARKS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
};

/* ---------- 02 Brushed steel: milled grain + the milled brand mark -------- */

export const BrushedSteelArt = ({ tier }) => {
  const c = PALETTES.BRUSHED_STEEL[tier];
  const id = useSvgIds("steel", "brush", "glow");

  /*
   * The Billionax mark, milled into the steel.
   *
   * This replaced a generic "B" monogram — the card now carries the actual
   * brand mark. Drawn inline rather than with the shared <LogoMark> because
   * the milled effect needs the SAME geometry stroked TWICE at different
   * colours and a 2px offset (a dark cut, then a light highlight), which a
   * single-element component cannot express. Sized to a 190-unit square:
   * r=70.3 at a 10.45 stroke.
   *
   * Called once per <g> below rather than computed once and reused: markPaths
   * carries a <mask> with an id from useId(), and reusing one JSX value in two
   * places in the tree would render that same id twice — the exact
   * document-global collision the note at the top of primitives.jsx warns
   * about, just at markup level instead of across sibling cards.
   */

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.steel} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.a} />
          <stop offset=".5" stopColor={c.b} />
          <stop offset=".62" stopColor={c.c} />
          <stop offset="1" stopColor={c.b} />
        </linearGradient>
        <pattern
          id={id.brush}
          width="4"
          height="1"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-8)"
        >
          <rect width="1.3" height="1" fill="#fff" opacity=".09" />
          <rect x="2.2" width=".8" height="1" fill="#000" opacity=".18" />
        </pattern>
        <radialGradient id={id.glow} cx=".8" cy=".7" r=".6">
          <stop offset="0" stopColor="#fff" stopOpacity=".10" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.steel})`} />
      <rect width="380" height="240" fill={`url(#${id.brush})`} />

      {/* The cut, then the highlight offset by 2px — that pairing is what
          makes the mark look milled into the surface rather than printed on
          it. Positioned so the ring sits off the right edge, as the ghost
          monogram did, leaving the left two-thirds clear for the type. */}
      <g transform="translate(228 25)" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="10.45">
        {markPaths(95, 95, 70.3)}
      </g>
      <g transform="translate(230 27)" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2.4">
        {markPaths(95, 95, 70.3)}
      </g>

      <rect width="380" height="240" fill={`url(#${id.glow})`} />
    </svg>
  );
};

/* -------------------- 03 Ornament: mosaic tile pattern ------------------- */

export const OrnamentArt = ({ tier }) => {
  const c = PALETTES.ORNAMENT[tier];
  const id = useSvgIds("tile", "vignette");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <pattern id={id.tile} width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill={c.bg} />
          <rect x="2" y="2" width="9" height="9" fill={c.tile} />
          <rect x="13" y="13" width="9" height="9" fill={c.tile} />
          <rect x="13" y="2" width="4" height="4" fill={c.tile2} />
          <rect x="18" y="7" width="4" height="4" fill={c.tile2} />
          <rect x="2" y="13" width="2" height="9" fill={c.tile2} />
          <rect x="6" y="13" width="2" height="9" fill={c.tile2} />
          <rect x="10" y="13" width="1" height="9" fill={c.tile2} />
          <rect x="4" y="4" width="5" height="5" fill={c.tile2} />
          <circle cx="17.5" cy="17.5" r="2.2" fill={c.tile2} />
        </pattern>
        <linearGradient id={id.vignette} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".18" />
          <stop offset=".5" stopColor="#000" stopOpacity=".05" />
          <stop offset="1" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.tile})`} />
      <rect width="380" height="240" fill={`url(#${id.vignette})`} />
      {/* Darkened band so the balance and member id stay legible over the tiles. */}
      <rect x="14" y="94" width="352" height="70" rx="6" fill="rgba(0,0,0,.18)" />
    </svg>
  );
};

/* ------------- 04 Aurum: black body, metal frame, corner net ------------- */

export const AurumArt = ({ tier }) => {
  const c = PALETTES.AURUM[tier];
  const id = useSvgIds("black", "edge", "netFade", "netMask");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.black} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#060606" />
        </linearGradient>
        <linearGradient id={id.edge} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.edge} />
          <stop offset=".5" stopColor="#fff" stopOpacity=".7" />
          <stop offset="1" stopColor={c.edge} />
        </linearGradient>
        <radialGradient id={id.netFade} cx="1" cy="0" r=".7">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={id.netMask}>
          <rect width="380" height="240" fill={`url(#${id.netFade})`} />
        </mask>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.black})`} />

      {/* Guilloché-ish net, faded into the top-right corner only. */}
      <g mask={`url(#${id.netMask})`} stroke={c.net} strokeWidth=".7" fill="none">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={`a${i}`} d={`M${200 + i * 16} 0 Q${260 + i * 12} 60 380 ${20 + i * 12}`} />
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <path key={`b${i}`} d={`M380 ${i * 14} Q330 ${40 + i * 8} ${190 + i * 14} 0`} />
        ))}
      </g>

      {/*
       * The metal frame follows the card's OWN corner radius.
       *
       * MembershipCard clips at --rad (18px over a 380px-wide card). Drawing
       * this frame at a tighter radius made it cross the clip near each
       * corner, where it was sliced off and the flat fill behind it showed
       * through as a pale ring — clearly visible on the light theme's white
       * ground. Inset by half the stroke so the 2px line sits fully inside.
       */}
      <rect
        x="1"
        y="1"
        width="378"
        height="238"
        rx="17"
        fill="none"
        stroke={`url(#${id.edge})`}
        strokeWidth="2"
      />
      <rect
        x="5"
        y="5"
        width="370"
        height="230"
        rx="13"
        fill="none"
        stroke={c.edge}
        strokeOpacity=".25"
        strokeWidth=".6"
      />
    </svg>
  );
};

/* -------------------- 05 Facet: low-poly crystal field ------------------- */

/**
 * Deterministic polygon field.
 *
 * The seeded LCG is the point: Math.random would reshuffle the crystal on
 * every re-render, so the card would visibly shimmer whenever the balance
 * changed. Same seed, same stone, every time.
 */
const facetPolygons = (c) => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const points = [];
  for (let y = -20; y <= 260; y += 50) {
    for (let x = -30; x <= 410; x += 55) {
      points.push([x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 40]);
    }
  }

  const cols = Math.ceil(440 / 55) + 1;
  const out = [];

  for (let i = 0; i < points.length - cols - 1; i += 1) {
    if ((i + 1) % cols === 0) continue;
    const [a, b, d, e] = [points[i], points[i + 1], points[i + cols], points[i + cols + 1]];

    const k1 = Math.floor(rand() * 3);
    out.push({ pts: `${a} ${b} ${d}`, fill: `hsl(${c.h[k1]} ${c.s[k1]}% ${c.l[k1] + (rand() - 0.5) * 14}%)` });

    const k2 = Math.floor(rand() * 3);
    out.push({ pts: `${b} ${e} ${d}`, fill: `hsl(${c.h[k2]} ${c.s[k2]}% ${c.l[k2] + (rand() - 0.5) * 14}%)` });
  }

  return out;
};

export const FacetArt = ({ tier }) => {
  const c = PALETTES.FACET[tier];
  const id = useSvgIds("vignette");
  const polys = facetPolygons(c);

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <radialGradient id={id.vignette} cx=".3" cy=".2" r="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".14" />
          <stop offset=".6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".6" />
        </radialGradient>
      </defs>

      {polys.map((p, i) => (
        <polygon key={i} points={p.pts} fill={p.fill} />
      ))}
      <rect width="380" height="240" fill={`url(#${id.vignette})`} />
    </svg>
  );
};

/* ------------- 06 Ledger: banknote guilloché + concentric seal ----------- */

export const LedgerArt = ({ tier }) => {
  const c = PALETTES.LEDGER[tier];

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <rect width="380" height="240" fill={c.bg} />

      <g fill="none" stroke={c.line} strokeWidth=".6">
        {Array.from({ length: 38 }, (_, i) => (
          <path
            key={i}
            d={`M0 ${i * 7 - 20} C 95 ${i * 7 - 40 + Math.sin(i) * 12} 190 ${i * 7 + 10} 285 ${
              i * 7 - 15
            } S 380 ${i * 7 + 5} 380 ${i * 7 + 2}`}
          />
        ))}
      </g>

      <g fill="none" stroke={c.acc} strokeOpacity=".55" strokeWidth=".7">
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx="330" cy="120" r={22 + i * 9} />
        ))}
      </g>

      <circle cx="330" cy="120" r="16" fill={c.bg} />
      <text
        x="330"
        y="128"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontSize="22"
        fontWeight="700"
        fill={c.acc}
      >
        B
      </text>

      <line x1="24" y1="128" x2="200" y2="128" stroke={c.acc} strokeOpacity=".5" strokeWidth=".8" />
    </svg>
  );
};

/* ---------------- 07 Keycard: paper stock + spine band ------------------- */

export const KeycardArt = ({ tier }) => {
  const c = PALETTES.KEYCARD[tier];
  const id = useSvgIds("paper");
  // Platinum flips to black stock, so the paper tooth has to invert with it.
  const dark = tier === "PLATINUM";

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <pattern id={id.paper} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".5" fill={dark ? "#fff" : "#000"} opacity=".05" />
        </pattern>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.paper})`} />

      <g stroke={c.ink} strokeOpacity=".16" strokeWidth=".8" fill="none">
        <line x1="36" y1="122" x2="344" y2="122" />
        <line x1="36" y1="186" x2="344" y2="186" />
      </g>

      {/* Door-lock mark, in place of the usual chip. */}
      <g transform="translate(300 132)" fill="none" stroke={c.band} strokeWidth="1.2">
        <rect x="0" y="0" width="44" height="44" rx="2" />
        <path d="M22 6v32M6 22h32" opacity=".5" />
        <circle cx="22" cy="22" r="9" />
      </g>
    </svg>
  );
};

/* ------------- 08 Monogram: navy, corner arcs, property initial ---------- */

export const MonogramArt = ({ tier, initial = "B" }) => {
  const c = PALETTES.MONOGRAM[tier];
  const id = useSvgIds("glow");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <radialGradient id={id.glow} cx="1" cy="1" r="1.1">
          <stop offset="0" stopColor={c.acc} stopOpacity=".22" />
          <stop offset="1" stopColor={c.acc} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="380" height="240" fill={c.bg} />
      <rect width="380" height="240" fill={`url(#${id.glow})`} />

      <g fill="none" stroke={c.ring} strokeWidth="1">
        {Array.from({ length: 11 }, (_, i) => (
          <circle key={i} cx="380" cy="240" r={40 + i * 26} />
        ))}
      </g>

      {/* Outlined initial of the property, so each partner's card differs. */}
      <text
        x="372"
        y="228"
        textAnchor="end"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="170"
        fill="none"
        stroke={c.acc}
        strokeOpacity=".55"
        strokeWidth="1"
      >
        {initial}
      </text>

      <rect x="24" y="52" width="28" height="2" fill={c.acc} />
    </svg>
  );
};

/* ---------- 09 Aurora: soft colour field with drifting light bands -------- */

/**
 * `family` selects the colourway — AURORA, AURORA_REEF, AURORA_EMBER,
 * AURORA_ORCHID or AURORA_FROST. One drawing, five palettes: the bands and the
 * grain are identical, only the three gradient stops change. A new colourway
 * therefore costs a palette entry and a registry entry, and no new art.
 *
 * Defaults to AURORA so a caller that forgets the prop still paints.
 */
export const AuroraArt = ({ tier, family = "AURORA" }) => {
  const c = PALETTES[family]?.[tier] || PALETTES.AURORA[tier];
  const id = useSvgIds("field", "band1", "band2", "grain", "soft");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.field} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.a} />
          <stop offset=".55" stopColor={c.b} />
          <stop offset="1" stopColor={c.c} />
        </linearGradient>
        {/* Two wide, low-opacity sweeps at different angles. Overlapping them
            is what reads as depth — a single band just looks like a stripe. */}
        <linearGradient id={id.band1} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id.band2} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".13" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* A touch of noise stops the wide gradients from banding on cheap
            phone panels, which is exactly where this design would show it. */}
        <filter id={id.grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <radialGradient id={id.soft} cx=".25" cy=".15" r=".75">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.field})`} />
      <path d="M-40 150 Q120 60 200 110 T420 70 L420 240 L-40 240Z" fill={`url(#${id.band1})`} />
      <path d="M-40 90 Q140 150 240 90 T420 130 L420 -10 L-40 -10Z" fill={`url(#${id.band2})`} />
      <rect width="380" height="240" fill={`url(#${id.soft})`} />
      <rect width="380" height="240" filter={`url(#${id.grain})`} opacity=".05" />
    </svg>
  );
};

/* ------------- 10 Marble: stone slab with a veined surface --------------- */

export const MarbleArt = ({ tier }) => {
  const c = PALETTES.MARBLE[tier];
  const id = useSvgIds("stone", "shade", "veinBlur");

  // The veins, as a data blob rather than logic — same idea as Metálica's
  // marks. Hand-drawn so they branch the way real stone does; a generated set
  // reads as regular, which is the one thing marble never is.
  const VEINS = [
    "M-10 62 Q60 44 108 74 T210 78 Q268 82 312 52 T400 40",
    "M-10 96 Q48 88 92 112 T186 118 Q252 122 300 96 T400 88",
    "M-10 168 Q70 150 126 176 T244 182 Q306 186 400 158",
    "M60 -10 Q76 60 58 116 T74 250",
    "M256 -10 Q244 54 268 104 T252 250",
  ];

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.stone} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.stock} />
          <stop offset=".5" stopColor={c.stock} />
          <stop offset="1" stopColor={c.stock} />
        </linearGradient>
        <linearGradient id={id.shade} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".26" />
          <stop offset=".55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".16" />
        </linearGradient>
        {/* Blurring the veins is what separates stone from a wiring diagram. */}
        <filter id={id.veinBlur}>
          <feGaussianBlur stdDeviation=".7" />
        </filter>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.stone})`} />
      <g
        fill="none"
        stroke={c.vein}
        strokeLinecap="round"
        filter={`url(#${id.veinBlur})`}
      >
        {VEINS.map((d, i) => (
          <path key={d} d={d} strokeWidth={i < 3 ? 1.9 : 1.1} />
        ))}
        {/* Hairline branches off the main veins, at half the weight. */}
        {VEINS.map((d) => (
          <path key={`t${d}`} d={d} strokeWidth=".5" opacity=".7" transform="translate(9 13)" />
        ))}
      </g>
      <rect width="380" height="240" fill={`url(#${id.shade})`} />
      {/* The accent rule under the balance, which anchors the type on a
          surface that is otherwise all texture. */}
      <rect x="24" y="130" width="54" height="2" rx="1" fill={c.acc} opacity=".85" />
    </svg>
  );
};

/* ----------- 11 Carbon: woven twill with a bright accent stripe ---------- */

export const CarbonArt = ({ tier }) => {
  const c = PALETTES.CARBON[tier];
  const id = useSvgIds("weave", "sheenC", "stripe");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        {/* A 2x2 twill: two light squares on the diagonal, two dark. At 8px it
            reads as woven texture rather than as a checkerboard. */}
        <pattern id={id.weave} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill={c.base} />
          <rect width="4" height="4" fill={c.weave} />
          <rect x="4" y="4" width="4" height="4" fill={c.weave} />
          <rect x="4" width="4" height="4" fill="#000" opacity=".16" />
          <rect y="4" width="4" height="4" fill="#000" opacity=".16" />
        </pattern>
        <linearGradient id={id.sheenC} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".10" />
          <stop offset=".45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".06" />
        </linearGradient>
        <linearGradient id={id.stripe} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c.acc} stopOpacity=".25" />
          <stop offset="1" stopColor={c.acc} />
        </linearGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.weave})`} />
      <rect width="380" height="240" fill={`url(#${id.sheenC})`} />
      {/* The single accent stripe, kept to the lower third so it never runs
          through the balance or the member id. */}
      <rect x="0" y="206" width="380" height="3" fill={`url(#${id.stripe})`} />
      <rect x="0" y="212" width="180" height="1" fill={c.acc} opacity=".35" />
    </svg>
  );
};

/* ------------ 12 Horizon: a landscape gradient with a low sun ------------ */

export const HorizonArt = ({ tier }) => {
  const c = PALETTES.HORIZON[tier];
  const id = useSvgIds("sky", "glowH", "ridge", "haze");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.top} />
          <stop offset="1" stopColor={c.bottom} />
        </linearGradient>
        {/* The sun sits off to the right so it never lands behind the balance,
            which is set on the left of every design. */}
        <radialGradient id={id.glowH} cx=".78" cy=".62" r=".42">
          <stop offset="0" stopColor={c.sun} stopOpacity=".85" />
          <stop offset=".35" stopColor={c.sun} stopOpacity=".28" />
          <stop offset="1" stopColor={c.sun} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id.haze} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={c.bottom} stopOpacity=".9" />
          <stop offset="1" stopColor={c.bottom} stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.sky})`} />
      <rect width="380" height="240" fill={`url(#${id.glowH})`} />
      <circle cx="296" cy="149" r="26" fill={c.sun} opacity=".5" />

      {/* Two ridges at different opacities give the depth a single one cannot. */}
      <path
        d="M-10 186 L60 162 L118 180 L182 150 L246 176 L310 152 L400 178 L400 250 L-10 250Z"
        fill="#000"
        opacity=".26"
      />
      <path
        d="M-10 206 L52 190 L128 208 L198 184 L268 206 L332 188 L400 204 L400 250 L-10 250Z"
        fill="#000"
        opacity=".42"
      />
      {/* Darkens the left edge so the guest name and member id stay readable
          over whatever the ridges are doing underneath. */}
      <rect width="220" height="240" fill={`url(#${id.haze})`} opacity=".5" />
    </svg>
  );
};

/* ========================================================================== *
 * THE INSIGNIA FAMILY — four designs built around the Billionax mark.
 *
 * Every family above treats the logo as a small corner ornament. These four
 * make it the hero: oversized, embossed, watermarked or centred. The mark's
 * geometry (a ring at r=37 with a bar overshooting 0.28r, in a 100-unit box)
 * is repeated locally in each rather than imported from <LogoMark>, because
 * each needs it stroked more than once — as a cut and a highlight, as a fill
 * and a rim — which a single component cannot express. Keep the proportions
 * in step with LogoMark in primitives.jsx.
 * ========================================================================== */

/* -------- 13 Crest: the mark oversized and centred, with a halo ---------- */

export const CrestArt = ({ tier }) => {
  const c = PALETTES.CREST[tier];
  const id = useSvgIds("crestBg", "halo", "crestSheen");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.crestBg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.bg} />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <radialGradient id={id.halo} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor={c.acc} stopOpacity=".22" />
          <stop offset="1" stopColor={c.acc} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id.crestSheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".08" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".05" />
        </linearGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.crestBg})`} />
      {/* The halo sits behind the mark and off to the right, so the balance
          and member id on the left stay on the plain ground. */}
      <circle cx="286" cy="120" r="118" fill={`url(#${id.halo})`} />

      {/* Concentric rings echoing the mark, fading outward. */}
      <g fill="none" stroke={c.halo} strokeWidth="1">
        <circle cx="286" cy="120" r="96" />
        <circle cx="286" cy="120" r="112" />
      </g>

      <g fill="none" stroke={c.acc} strokeWidth="5" opacity=".92">
        {markPaths(286, 120, 62)}
      </g>
      <rect width="380" height="240" fill={`url(#${id.crestSheen})`} />
    </svg>
  );
};

/* ---- 14 Emblem: letterpress stock, the mark debossed with a spine band --- */

export const EmblemArt = ({ tier }) => {
  const c = PALETTES.EMBLEM[tier];
  const id = useSvgIds("stockE", "press", "grainE");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.stockE} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.stock} />
          <stop offset="1" stopColor={c.stock} />
        </linearGradient>
        {/* The debossed edge: a dark inner shadow with a light lower rim, which
            is what sells "pressed into the stock" on a flat colour. */}
        <filter id={id.press} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.4" stdDeviation="0.9" floodColor="#fff" floodOpacity=".5" />
          <feDropShadow dx="0" dy="-1" stdDeviation="1.1" floodColor="#000" floodOpacity=".32" />
        </filter>
        <filter id={id.grainE} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.stockE})`} />
      {/* Paper tooth. Very low opacity — enough to kill the flatness. */}
      <rect width="380" height="240" filter={`url(#${id.grainE})`} opacity=".055" />

      {/* The spine band down the right edge, which the mark sits against. */}
      <rect x="330" y="0" width="6" height="240" fill={c.band} opacity=".5" />

      <g
        fill="none"
        stroke={c.mark}
        strokeWidth="4.4"
        opacity=".55"
        filter={`url(#${id.press})`}
      >
        {markPaths(268, 120, 52)}
      </g>
    </svg>
  );
};

/* ----- 15 Imprint: brushed metal with the mark as a large watermark ------ */

export const ImprintArt = ({ tier }) => {
  const c = PALETTES.IMPRINT[tier];
  const id = useSvgIds("metal", "mill", "imprintGlow", "fadeI", "maskI");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.a} />
          <stop offset=".48" stopColor={c.b} />
          <stop offset=".6" stopColor={c.c} />
          <stop offset="1" stopColor={c.b} />
        </linearGradient>
        {/* Circular milling rather than the linear grain Brushed Steel uses —
            it echoes the mark and keeps the two families distinct. */}
        <pattern id={id.mill} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <rect width="1" height="3" fill="#fff" opacity=".07" />
          <rect x="1.6" width=".7" height="3" fill="#000" opacity=".14" />
        </pattern>
        <radialGradient id={id.imprintGlow} cx=".72" cy=".3" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".14" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* Fades the watermark out towards the left so it never competes with
            the balance, which is the brightest thing on the card. */}
        <linearGradient id={id.fadeI} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset=".45" stopColor="#555" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <mask id={id.maskI}>
          <rect width="380" height="240" fill={`url(#${id.fadeI})`} />
        </mask>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.metal})`} />
      <rect width="380" height="240" fill={`url(#${id.mill})`} />

      {/* The watermark: very large, bleeding off the top and right, masked to
          fade in from the left. Cut then highlight, as on Brushed Steel. */}
      <g mask={`url(#${id.maskI})`}>
        <g fill="none" stroke="rgba(0,0,0,.30)" strokeWidth="11">
          {markPaths(300, 96, 104)}
        </g>
        <g fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="2.6">
          {markPaths(302, 98, 104)}
        </g>
      </g>

      <rect width="380" height="240" fill={`url(#${id.imprintGlow})`} />
    </svg>
  );
};

/* ------ 16 Signet: the mark as a wax-seal medallion on a deep ground ----- */

export const SignetArt = ({ tier }) => {
  const c = PALETTES.SIGNET[tier];
  const id = useSvgIds("signetBg", "medal", "medalEdge", "signetSheen");

  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 380 240" aria-hidden="true">
      <defs>
        <linearGradient id={id.signetBg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.bg} />
          <stop offset="1" stopColor="#05070a" />
        </linearGradient>
        {/* The medallion face: lit from the top-left so it reads as raised. */}
        <radialGradient id={id.medal} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor={c.acc} stopOpacity=".30" />
          <stop offset=".65" stopColor={c.acc} stopOpacity=".12" />
          <stop offset="1" stopColor="#000" stopOpacity=".22" />
        </radialGradient>
        <linearGradient id={id.medalEdge} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.acc} stopOpacity=".9" />
          <stop offset=".5" stopColor={c.acc} stopOpacity=".35" />
          <stop offset="1" stopColor={c.acc} stopOpacity=".8" />
        </linearGradient>
        <linearGradient id={id.signetSheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".07" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity=".04" />
        </linearGradient>
      </defs>

      <rect width="380" height="240" fill={`url(#${id.signetBg})`} />

      {/* Faint guilloché rings across the whole face, behind everything. */}
      <g fill="none" stroke={c.ring} strokeWidth=".8">
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx="298" cy="126" r={42 + i * 13} />
        ))}
      </g>

      {/* The medallion. */}
      <circle cx="298" cy="126" r="60" fill={`url(#${id.medal})`} />
      <circle cx="298" cy="126" r="60" fill="none" stroke={`url(#${id.medalEdge})`} strokeWidth="2.2" />
      <circle cx="298" cy="126" r="53" fill="none" stroke={c.acc} strokeWidth=".7" opacity=".45" />

      {/* The mark struck into it. */}
      <g fill="none" stroke={c.acc} strokeWidth="4.6" opacity=".95">
        {markPaths(298, 126, 34)}
      </g>

      <rect width="380" height="240" fill={`url(#${id.signetSheen})`} />
    </svg>
  );
};
