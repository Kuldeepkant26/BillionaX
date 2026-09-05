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
 * The bar is drawn AFTER the ring and in the same colour, so the two read as
 * one mark. In the original the bar simply passes in front — there is no gap
 * cut in the ring, which an earlier reading of the artwork got wrong.
 */
export const LogoMark = ({
  className = "",
  stroke = "currentColor",
  strokeWidth = 5.5,
  opacity = 1,
  style,
}) => (
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
    <circle cx="50" cy="50" r="37" />
    <path d="M50 2.6v94.8" strokeLinecap="butt" />
  </svg>
);
