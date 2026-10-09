/*
 * The six category glyphs for the privilege cards, keyed by the `icon` names
 * in privilegeCategory.js.
 *
 * Inline rather than an icon package — the app ships no icon library, and six
 * paths cost less than a dependency. Drawn as open strokes on a 24-box in
 * currentColor, matching the fine line work of the client's reference, so
 * whatever sets the colour (the chip, the sheet, the no-photo art) decides
 * how they read.
 */
const GLYPHS = {
  // A fork beside a knife, as in the reference's "Food & beverage" chip.
  cutlery: (
    <>
      <path d="M6.6 3.2v4.4a1.9 1.9 0 0 0 3.8 0V3.2M8.5 3.2v4.1M8.5 9.5v11.3" />
      <path d="M17.2 20.8V3.3c-2 1.1-3.2 3.6-3.2 6.6v3.6h3.2" />
    </>
  ),
  // A cup on its saucer with two wisps of steam.
  cup: (
    <>
      <path d="M4.6 10h11.2v3.9a5 5 0 0 1-5 5h-1.2a5 5 0 0 1-5-5z" />
      <path d="M15.8 11.4h1.1a2.3 2.3 0 0 1 0 4.6h-1.5M3.4 21.1h14.6" />
      <path d="M8.3 3.6c-.7.9.6 1.6 0 2.6M11.6 3.6c-.7.9.6 1.6 0 2.6" />
    </>
  ),
  // Three petals and two leaves — the reference's spa mark.
  lotus: (
    <>
      <path d="M12 19.6c-2.4-1.5-3.6-3.9-3.6-6.8s1.2-5.2 3.6-7.4c2.4 2.2 3.6 4.5 3.6 7.4s-1.2 5.3-3.6 6.8z" />
      <path d="M9 9.2c-1.9-.6-3.7-.5-5.4.2.3 4.8 3.4 8.6 8.4 10.2M15 9.2c1.9-.6 3.7-.5 5.4.2-.3 4.8-3.4 8.6-8.4 10.2" />
      <path d="M2.6 14.4c1.2 2.9 4.4 4.9 9.4 5.2 5-.3 8.2-2.3 9.4-5.2" />
    </>
  ),
  // A bed seen from the foot: headboard, two pillows, mattress, legs.
  bed: (
    <>
      <path d="M5 11V6.8A1.8 1.8 0 0 1 6.8 5h10.4A1.8 1.8 0 0 1 19 6.8V11" />
      <path d="M7.5 11V9.6a1.1 1.1 0 0 1 1.1-1.1h2.2a1.1 1.1 0 0 1 1.1 1.1V11M12.1 11V9.6a1.1 1.1 0 0 1 1.1-1.1h2.2a1.1 1.1 0 0 1 1.1 1.1V11" />
      <path d="M3.4 17.4v-4.6A1.8 1.8 0 0 1 5.2 11h13.6a1.8 1.8 0 0 1 1.8 1.8v4.6zM4.4 17.4v2.2M19.6 17.4v2.2" />
    </>
  ),
  // A car head-on — an airport run or a chauffeured transfer.
  car: (
    <>
      <path d="M4 17.2v-4.3l1.7-4.4A2.2 2.2 0 0 1 7.8 7h8.4a2.2 2.2 0 0 1 2.1 1.5l1.7 4.4v4.3z" />
      <path d="M5.6 12.4h12.8M5.4 17.2v2.1h2.3v-2.1M16.3 17.2v2.1h2.3v-2.1" />
      <path d="M7.4 14.8h.6M16 14.8h.6" />
    </>
  ),
  // The neutral mark for anything unrecognised: a sparkle and a small echo.
  spark: (
    <>
      <path d="M10.8 3.6c.7 4.4 2.4 6.1 6.8 6.8-4.4.7-6.1 2.4-6.8 6.8-.7-4.4-2.4-6.1-6.8-6.8 4.4-.7 6.1-2.4 6.8-6.8z" />
      <path d="M18.3 15.4c.3 1.6.9 2.2 2.5 2.5-1.6.3-2.2.9-2.5 2.5-.3-1.6-.9-2.2-2.5-2.5 1.6-.3 2.2-.9 2.5-2.5z" />
    </>
  ),
};

/** An unknown name draws the spark rather than nothing. */
export const PrivilegeIcon = ({ name, className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.35"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    className={className}
  >
    {GLYPHS[name] || GLYPHS.spark}
  </svg>
);
