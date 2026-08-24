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
