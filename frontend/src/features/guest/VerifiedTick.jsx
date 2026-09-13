/**
 * The verified badge on a hotel admin's or the main admin's row.
 *
 * Filled with var(--acc) rather than a literal blue. Every colour in this app
 * comes from the accent system the main admin chooses network-wide, and a
 * hard-coded #1d9bf0 would be the single element on screen ignoring it —
 * conspicuous in exactly the themes that are not blue.
 */
export const VerifiedTick = ({ size = 13, className = "" }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={`inline-block shrink-0 align-[-0.1em] ${className}`}
    role="img"
    aria-label="Verified"
  >
    {/* The scalloped badge, then the check knocked out of it in the page's
        own background colour so the mark reads at 13px. */}
    <path
      fill="var(--acc)"
      d="M12 1.6l2.2 1.9 2.9-.3 1 2.7 2.6 1.3-.7 2.8L22 12.4l-2 2.1.3 2.9-2.8.9-1.4 2.6-2.8-.7-2.3 1.8-2.3-1.8-2.8.7-1.4-2.6-2.8-.9.3-2.9-2-2.1 1.9-2.4-.7-2.8 2.6-1.3 1-2.7 2.9.3z"
    />
    <path
      fill="var(--acc-fg)"
      d="M10.6 15.6l-3-3 1.3-1.3 1.7 1.7 4.2-4.2 1.3 1.3z"
    />
  </svg>
);

export default VerifiedTick;
