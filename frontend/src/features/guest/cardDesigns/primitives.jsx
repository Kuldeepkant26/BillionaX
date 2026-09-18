import { useId } from "react";

/**
 * Pieces shared by every card family.
 *
 * A note on ids: SVG `id`s are DOCUMENT-global, not component-scoped. The
 * mockup could hardcode them because it drew each card once; the app renders
 * the same family three times on the admin's picker, and duplicate ids mean
 * every card resolves `url(#foil)` to the FIRST definition on the page — so
 * Gold and Platinum would silently paint in Silver's gradient. Every component
 * below takes its ids from useId() for that reason. Do not hardcode them back.
 */

/**
 * Contactless mark. Decorative — it signals "card", not a payment rail.
 * `rotated` matches the mockup's Ornament family, which turns it on its side.
 */
export const NfcMark = ({ rotated = false, className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    className={className}
    style={rotated ? { transform: "rotate(90deg)" } : undefined}
    aria-hidden="true"
  >
    <path d="M6 9.5a6 6 0 0 1 0 5" />
    <path d="M9.5 6.5a10 10 0 0 1 0 11" />
    <path d="M13 3.5a14 14 0 0 1 0 17" />
  </svg>
);

/**
 * The gold contact plate. Pure decoration, same as the NFC mark.
 * `tone` swaps the brass for steel, which Metálica uses.
 */
export const ChipMark = ({ tone = "gold", className = "", style }) => {
  const fill =
    tone === "steel"
      ? "linear-gradient(135deg,#d9d9d9,#8d8d8d 45%,#e6e6e6 60%,#6b6b6b)"
      : "linear-gradient(135deg,#e9d7a4 0%,#c9a659 40%,#f1e2b5 60%,#a8843f 100%)";

  return (
    <span
      className={`absolute rounded-[6px] ${className}`}
      aria-hidden="true"
      style={{
        background: fill,
        boxShadow:
          "0 1px 0 rgba(255,255,255,.4) inset,0 -1px 0 rgba(0,0,0,.35) inset,0 1px 3px rgba(0,0,0,.5)",
        ...style,
      }}
    >
      {/* The inner rule and cross-line that make it read as a contact plate. */}
      <span className="absolute inset-[5px_6px] rounded-[3px] border border-black/25" />
      <span className="absolute left-0 right-0 top-[13px] h-px bg-black/[.28]" />
    </span>
  );
};

/** Fixed diagonal gloss. Static on purpose — see the note in MembershipCard. */
export const Sheen = () => (
  <span
    className="pointer-events-none absolute inset-0"
    aria-hidden="true"
    style={{
      background:
        "linear-gradient(115deg,rgba(255,255,255,.10) 0%,rgba(255,255,255,0) 35%,rgba(255,255,255,0) 65%,rgba(255,255,255,.05) 100%)",
    }}
  />
);

/**
 * The Billionax mark: a ring with a vertical bar through it.
 *
 * Redrawn as geometry rather than embedding public/logo.png, because the card
 * art is SVG that scales from a 78px picker tile to a full-width card. The PNG
 * is 265x250 and would soften at card size and waste bytes at tile size. Drawn
 * this way it also takes `stroke`, so each design can render the mark in its
 * own metal instead of the fixed brand gold — which is what lets it sit on
 * steel, on marble and on a dark field without looking pasted on.
 *
 * Proportions are measured from the source PNG: a ring of radius 74 at an
 * 11px stroke, centred at (135, 125.5) in its 265x250 frame, with the bar
 * running x=129..140 from y=32 to y=220 — i.e. overshooting the ring by
 * roughly 0.28x its radius at each end. Normalised here to a 100x100
 * viewBox: r=37, stroke 5.5, bar from y=2.6 to y=97.4.
 *
 * The ring is NOT a closed circle. Measuring the source PNG shows two short
 * breaks where the bar crosses it: one just past top-centre on the bar's
 * right, one just past bottom-centre on the bar's left — nothing at the other
 * two corners, where the ring runs flush into the bar. A prior pass here read
 * a blurred crop as a complete ring and removed this.
 *
 * The breaks are cut with a MASK rather than by splitting the ring into two
 * stroked arcs. Two arcs sounds simpler, but an arc's cut end is a flat face
 * perpendicular to the curve's tangent — at a radius this tight, getting both
 * ends of both arcs to (a) actually leave open space at the gapped corners and
 * (b) disappear cleanly under the bar at the flush corners, with no seam and
 * no misplaced endpoint, means solving four separate angles by hand. That is
 * exactly what went wrong the first time this was tried: one sign slip near a
 * pole and an arc's endpoint lands on the wrong side of the bar entirely. A
 * mask sidesteps all of it — the ring stays ONE ordinary closed circle (always
 * smooth, never a joinery problem), and the two notches are just rectangles
 * punched out where the bar crosses.
 *
 * The notch position MUST be measured off the bar's own actual paint width,
 * not guessed from a ratio to `r`. The second pass at this (ROD_RATIO, since
 * removed) assumed every caller draws the bar at the same 5.5/37 proportion
 * LogoMark does — but artwork.jsx's designs paint the ring and bar through a
 * parent <g>'s strokeWidth, which is its own number per design (5, 4.4, 11,
 * 2.6, 4.6, and — worse — 10.45 and 2.4 for the SAME mark stroked twice on
 * Brushed Steel). A guessed width that runs thin makes the notch open too far
 * past the bar's real edge (the ring reads as stopping outside the bar); one
 * that runs thick makes the notch fall short of it (the ring reads as sitting
 * on top of the bar instead of parting around it) — which is exactly the two
 * failures this produced. `barWidth` below is that real number, threaded in
 * by the caller rather than assumed.
 */

/**
 * The ring's two notches as a luminance mask, keyed to one <circle mask=...>.
 * `barWidth` must be the actual stroke width the bar is about to be painted
 * with, in the same units as `cx`/`cy`/`r` — see the note above.
 *
 * `id` must be unique per instance (SVG ids are document-global — see the note
 * above) and stroke="none" on every mask shape is deliberate: without it these
 * rects inherit the parent's stroke color, which paints a thin outline that
 * itself carries partial luminance and turns each clean notch into a hazy,
 * partly-see-through patch instead of an actual gap.
 */
const RingMask = ({ id, cx, cy, r, barWidth }) => {
  const rodHalf = barWidth / 2;
  // How far past the bar's edge each notch opens into clear space, and how
  // tall it cuts — both scaled off the bar's own half-width, so the gap keeps
  // the same proportion to the bar regardless of the bar's own width.
  const notchOpen = rodHalf * 2.2;
  const notchTall = rodHalf * 2.6;
  // How far the cut stops SHORT of the bar's far edge, so the arc runs a hair
  // UNDER the bar and the two blend with no seam. It must be negative-inward
  // (i.e. the mask ends inside the bar), never outward: an outward overshoot
  // ends the arc before the bar starts and leaves a 1-2px gap you can see.
  const tuck = rodHalf * 0.35;
  const pad = r * 0.2; // clears the mask's own bounding box outside the ring
  return (
    <mask id={id}>
      <rect x={cx - r - pad} y={cy - r - pad} width={2 * (r + pad)} height={2 * (r + pad)} fill="white" stroke="none" />
      {/*
        Each notch spans the bar's FULL width as well as the gap beside it.
        Starting at the bar's near edge left the arc that runs UNDER the bar
        uncut, so it emerged on the far side as a short gold stub — the ring
        and bar read as a cross at each crossing instead of the ring breaking
        cleanly. Beginning the cut at the bar's opposite edge removes that
        buried segment along with the open gap, in one rectangle.

        The cut stops just INSIDE the bar's far edge (`tuck`), so the arc runs
        slightly under the bar and the join is seamless. Ending it on or past
        that edge is what left a visible 1-2px gap on the attached side.
      */}
      {/* Top: gap opens to the RIGHT, and the cut reaches back under the bar. */}
      <rect
        x={cx - rodHalf + tuck}
        y={cy - r - notchTall / 2}
        width={rodHalf * 2 + notchOpen - tuck}
        height={notchTall}
        fill="black"
        stroke="none"
      />
      {/* Bottom: gap opens to the LEFT, mirrored. */}
      <rect
        x={cx - rodHalf - notchOpen}
        y={cy + r - notchTall / 2}
        width={rodHalf * 2 + notchOpen - tuck}
        height={notchTall}
        fill="black"
        stroke="none"
      />
    </mask>
  );
};

/**
 * The mark's ring and bar at a given centre and radius, for stroking.
 *
 * Shared by every design that draws the mark, so the proportions are defined
 * once. Exported so artwork.jsx's markPaths — which strokes the same geometry
 * more than once per design (a dark cut then a light highlight, a fill then a
 * rim) — can reuse it rather than duplicating the notch math.
 *
 * `barWidth` is the actual strokeWidth the caller's surrounding <g> paints
 * this with — required, not defaulted, because guessing it from `r` is the
 * bug this replaced (see the note above). Every call site in artwork.jsx
 * passes its <g>'s own strokeWidth literal here.
 *
 * A hook (useId), like every other id in this file — see the note at the top.
 * Every call site invokes this unconditionally as plain JSX, so it is always
 * reached in the same order relative to a design's other hooks.
 */
export const ringAndBar = (cx, cy, r, barWidth) => {
  const id = `mk${useId().replace(/:/g, "")}`;
  return (
    <>
      <RingMask id={id} cx={cx} cy={cy} r={r} barWidth={barWidth} />
      <circle cx={cx} cy={cy} r={r} mask={`url(#${id})`} />
      <path d={`M${cx} ${cy - r * 1.28}v${r * 2.56}`} />
    </>
  );
};

export const LogoMark = ({
  className = "",
  stroke = "currentColor",
  strokeWidth = 5.5,
  opacity = 1,
  style,
}) => {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      opacity={opacity}
      aria-hidden="true"
    >
      {/* The bar is painted at `strokeWidth`, so the notch is measured off that
          same real number rather than a guess — see RingMask. */}
      <RingMask id={`logoRing-${id}`} cx={50} cy={50} r={37} barWidth={strokeWidth} />
      <circle cx="50" cy="50" r="37" mask={`url(#logoRing-${id})`} />
      <path d="M50 2.6v94.8" strokeLinecap="butt" />
    </svg>
  );
};
