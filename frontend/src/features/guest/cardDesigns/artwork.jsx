import { PALETTES } from "./palettes.js";
import { useSvgIds } from "./tokens.js";

/**
 * The background artwork for each family: everything behind the text.
 *
 * Each component takes a tier and paints one 380x240 SVG that stretches to the
 * card. They are pure — no data, no layout — so the same art serves the guest
 * card and the admin's picker without either knowing about the other.
 */

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

/* ------------- 02 Brushed steel: milled grain + ghost monogram ------------ */

export const BrushedSteelArt = ({ tier }) => {
  const c = PALETTES.BRUSHED_STEEL[tier];
  const id = useSvgIds("steel", "brush", "glow");

  // The B, drawn twice: a dark cut and a light highlight offset by 2px, which
  // is what makes it look milled into the surface rather than printed on it.
  const monogram = (
    <>
      <path d="M20 0v190" />
      <path d="M20 0h60a45 45 0 0 1 0 90H20" />
      <path d="M20 90h72a50 50 0 0 1 0 100H20" />
    </>
  );

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

      <g transform="translate(250 30)" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="10">
        {monogram}
      </g>
      <g transform="translate(252 32)" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2">
        {monogram}
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

      <rect
        x="1.5"
        y="1.5"
        width="377"
        height="237"
        rx="13"
        fill="none"
        stroke={`url(#${id.edge})`}
        strokeWidth="2"
      />
      <rect
        x="5"
        y="5"
        width="370"
        height="230"
        rx="10"
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
