/**
 * Background art for the sign-in screen designs.
 *
 * Every piece here paints from the THEME TOKENS — --hero, --acc, --acc2,
 * --bg, --bg2, --line — and never a literal brand colour. That is what lets
 * one design serve all 27 accents in both light and dark mode: the admin
 * picks the layout here and the palette in theme settings, and the two
 * compose. A hex value in this file would break that for every accent but
 * the one it was chosen against.
 *
 * White and black at low alpha are the exception and are fine: they lighten
 * or deepen whatever is underneath rather than introducing a hue, so they
 * behave correctly on every accent.
 *
 * These render behind the form, so nothing here may capture pointer events
 * and nothing may be focusable.
 *
 * DRAWN, NOT WASHED. Each piece below builds a real figure — an arc, a
 * colonnade, a horizon, a monogram field — rather than parking a soft
 * gradient behind the brand. A backdrop that is only a blur reads as an
 * unfinished screen at any size, which is what these replace.
 */

/** Shared by every full-bleed backdrop. */
const fill = { position: "absolute", inset: 0, pointerEvents: "none" };

/**
 * The SVG layer every drawn design sits on.
 *
 * preserveAspectRatio="none" on a 100x100 box means the art stretches to
 * whatever the band's aspect ratio turns out to be, so a piece composed here
 * holds its proportions from a short band on a landscape phone to a tall one
 * on a large device. Pieces that must NOT distort (a true circle, a monogram)
 * pass their own ratio.
 */
const Stage = ({ children, ratio = "none", ...rest }) => (
  <svg
    viewBox="0 0 100 100"
    preserveAspectRatio={ratio}
    aria-hidden="true"
    focusable="false"
    style={{ ...fill, display: "block", width: "100%", height: "100%" }}
    {...rest}
  >
    {children}
  </svg>
);

/* ===================================================================== *
 * MINIMAL — no band and no figure. The mark, the form, centred on the
 * page ground and nothing else.
 *
 * These are the only designs whose art is NOT a backdrop behind a brand
 * band: there is no band. What little they paint is a whole-page ground,
 * so each one is a single wash sized to the viewport rather than a
 * composed figure. The restraint is the entire design.
 * ===================================================================== */

/** Nothing at all — the page ground, exactly as the theme defines it. */
export const VoidArt = () => null;

/**
 * A single soft pool of accent behind the centred stack, top-weighted so it
 * sits behind the mark rather than the fields.
 */
export const HaloArt = () => (
  <div
    style={{
      ...fill,
      background:
        "radial-gradient(90% 52% at 50% 16%, color-mix(in srgb, var(--acc) 18%, transparent) 0%, transparent 70%)",
    }}
  />
);

/**
 * A soft vignette: the page ground lifted at the top and settled at the foot,
 * so the centred stack sits in a pool of light.
 *
 * An earlier version drew a hairline frame inset from the page edge. It was a
 * mistake twice over: a rectangle tracing the viewport reads as a stray
 * browser border rather than an ornament, and because the art layer sits
 * behind the content, the frame's top edge ran along the page and passed
 * behind the logo — one continuous line through the composition.
 *
 * The lesson generalises to this whole family: a MINIMAL backdrop must have
 * no hard edge anywhere the content sits, because there is no band to contain
 * it. Anything drawn here is a wash, never a line.
 */
export const VignetteArt = () => (
  <div
    style={{
      ...fill,
      background:
        "radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--acc) 10%, transparent) 0%, transparent 60%), linear-gradient(180deg, transparent 55%, color-mix(in srgb, var(--fg) 5%, transparent) 100%)",
    }}
  />
);

/* ===================================================================== *
 * PREMIUM — deep grounds, one confident gesture, nothing decorative.
 * The restraint is the point: these should read as expensive because of
 * what they leave out.
 * ===================================================================== */

/**
 * ATELIER — a single struck arc over a deep ground.
 *
 * One line, drawn once, off-centre. The arc is stroked rather than filled so
 * it stays a gesture at every band height, and it breaks the frame on both
 * sides so the eye reads it as larger than the screen.
 */
export const AtelierArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage ratio="xMidYMid slice">
      <defs>
        <linearGradient id="atl-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id="atl-b" cx="0.72" cy="0.08" r="0.78">
          <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.38" />
          <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#atl-b)" />
      <circle cx="74" cy="34" r="46" fill="none" stroke="url(#atl-a)" strokeWidth="0.9" />
      <circle cx="74" cy="34" r="30" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.6" />
    </Stage>
  </div>
);

/**
 * COLONNADE — evenly spaced vertical piers, taller toward the centre.
 *
 * Architectural rather than graphic: the spacing is regular and the fade is
 * vertical, so it suggests a hall receding rather than a striped pattern.
 */
export const ColonnadeArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage>
      <defs>
        <linearGradient id="col-f" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
          <stop offset="72%" stopColor="rgba(255,255,255,0.10)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* Wide piers with a narrow gap, so the eye reads columns and the gaps
          between them — thin bars on a wide ground read as stripes instead. */}
      {[4, 17, 30, 43, 56, 69, 82, 95].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={i % 2 ? 16 : 4}
          width="7.5"
          height={i % 2 ? 84 : 96}
          fill="url(#col-f)"
        />
      ))}
      {/* A capital line across the tops, which is what makes it a colonnade
          rather than a row of unrelated bars. */}
      <rect x="0" y="15" width="100" height="0.6" fill="rgba(255,255,255,0.22)" />
      <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.1)" />
    </Stage>
  </div>
);

/**
 * MERIDIAN — a low horizon with a single accent band above it.
 *
 * The one piece in the set built on a horizontal division. It gives the
 * brand a ground to sit on, which is why it pairs with a left-set brand.
 */
export const MeridianArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage>
      <defs>
        <linearGradient id="mer-s" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.46" />
          <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="62" fill="url(#mer-s)" />
      <rect x="0" y="61.4" width="100" height="0.5" fill="rgba(255,255,255,0.34)" />
      <rect x="0" y="62" width="100" height="38" fill="rgba(0,0,0,0.22)" />
    </Stage>
  </div>
);

/* ===================================================================== *
 * MODERN — structural, high-contrast, hard-edged. Geometry the eye can
 * follow, not texture.
 * ===================================================================== */

/**
 * BLUEPRINT — a measured grid with one heavier axis.
 *
 * The heavy cross is what keeps this from being wallpaper: it gives the grid
 * an origin, so it reads as a drawing rather than a texture.
 */
export const BlueprintArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage>
      <g stroke="rgba(255,255,255,0.13)" strokeWidth="0.35">
        {[12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((v) => (
          <line key={`v${v}`} x1={v} y1="0" x2={v} y2="100" />
        ))}
        {[20, 40, 60, 80].map((h) => (
          <line key={`h${h}`} x1="0" y1={h} x2="100" y2={h} />
        ))}
      </g>
      <g stroke="rgba(255,255,255,0.46)" strokeWidth="0.7">
        <line x1="25" y1="0" x2="25" y2="100" />
        <line x1="0" y1="60" x2="100" y2="60" />
      </g>
      <circle cx="25" cy="60" r="2.4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.7" />
    </Stage>
  </div>
);

/**
 * ESCARP — two hard diagonal planes cutting the band.
 *
 * Flat fills, no blur. The contrast between the two planes is what carries
 * it, so both are opaque washes over --hero rather than gradients.
 */
export const EscarpArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage>
      <polygon points="0,0 100,0 100,34 0,72" fill="rgba(255,255,255,0.10)" />
      <polygon points="0,72 100,34 100,100 0,100" fill="rgba(0,0,0,0.30)" />
      <polyline
        points="0,72 100,34"
        fill="none"
        stroke="var(--acc)"
        strokeOpacity="0.85"
        strokeWidth="0.8"
      />
    </Stage>
  </div>
);

/**
 * MONOLITH — one oversized block, half off-frame, with a thin accent edge.
 *
 * Deliberately asymmetric and deliberately cropped: the block is larger than
 * the band can show, which is what makes a small screen feel like a detail
 * of something bigger.
 */
export const MonolithArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage>
      <rect x="52" y="-14" width="62" height="96" fill="rgba(0,0,0,0.26)" />
      <rect x="52" y="-14" width="0.7" height="96" fill="var(--acc)" fillOpacity="0.9" />
      <rect x="-8" y="58" width="44" height="60" fill="rgba(255,255,255,0.08)" />
    </Stage>
  </div>
);

/* ===================================================================== *
 * LUXE — maximal. Gold-weight ornament, gloss, repeated motif. Where
 * Premium withholds, this one performs.
 * ===================================================================== */

/**
 * REGENCY — a repeating diamond lattice with a bright sheen across it.
 *
 * The lattice is a <pattern> so it tiles at a fixed size regardless of band
 * height — a stretched lattice looks like a mistake rather than an ornament,
 * which is why this piece does not use Stage's default stretch.
 */
export const RegencyArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage ratio="xMidYMid slice">
      <defs>
        <pattern id="reg-p" width="11" height="11" patternUnits="userSpaceOnUse">
          <path
            d="M5.5 0 11 5.5 5.5 11 0 5.5Z"
            fill="none"
            stroke="rgba(255,255,255,0.20)"
            strokeWidth="0.4"
          />
        </pattern>
        <linearGradient id="reg-s" x1="0" y1="0" x2="1" y2="0.7">
          <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
          <stop offset="42%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.30)" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#reg-p)" />
      <rect width="100" height="100" fill="url(#reg-s)" />
    </Stage>
  </div>
);

/**
 * OPULENCE — concentric rings struck from the lower right, with a bloom.
 *
 * A guilloche figure, but anchored off-frame so only the outer arcs show.
 * The bloom keeps the centre from reading as a target.
 */
export const OpulenceArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage ratio="xMidYMid slice">
      <defs>
        <radialGradient id="opu-b" cx="0.82" cy="0.9" r="0.72">
          <stop offset="0%" stopColor="var(--acc)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--acc)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#opu-b)" />
      <g fill="none" stroke="rgba(255,255,255,0.17)" strokeWidth="0.45">
        {[18, 30, 42, 54, 66, 78, 90].map((r) => (
          <circle key={r} cx="84" cy="92" r={r} />
        ))}
      </g>
      <rect width="100" height="100" fill="rgba(0,0,0,0.12)" />
    </Stage>
  </div>
);

/**
 * IMPERIAL — a crowned arch: one tall centred arch with a ray field behind.
 *
 * The most formal composition in the set, and the only one that demands a
 * centred brand — the arch has an axis, and a left-set brand fights it.
 */
export const ImperialArt = () => (
  <div style={{ ...fill, background: "var(--hero)", overflow: "hidden" }}>
    <Stage>
      <defs>
        <linearGradient id="imp-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.26)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.02)" />
        </linearGradient>
      </defs>
      <g stroke="rgba(255,255,255,0.10)" strokeWidth="0.5">
        {[-40, -26, -13, 0, 13, 26, 40].map((d) => (
          <line key={d} x1="50" y1="104" x2={50 + d * 2.1} y2="-10" />
        ))}
      </g>
      {/*
       * The arch springs from y=58 and its crown reaches y=14, so the curve
       * occupies the upper half of the band where the eye lands. An earlier
       * version sprang from 46 with a 22 radius, which put the crown low and
       * made the figure read as a headstone rather than an arch.
       */}
      <path
        d="M22 100 V58 A28 44 0 0 1 78 58 V100 Z"
        fill="url(#imp-a)"
        stroke="rgba(255,255,255,0.38)"
        strokeWidth="0.7"
      />
      {/* An inner arch, offset — the depth cue that makes it an opening. */}
      <path
        d="M31 100 V60 A19 30 0 0 1 69 60 V100 Z"
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="0.5"
      />
      <rect width="100" height="100" fill="rgba(0,0,0,0.16)" />
    </Stage>
  </div>
);
