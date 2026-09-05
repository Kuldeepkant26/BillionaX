import { FONT_PRESETS, FONT_PRESET_KEYS } from "../../theme/fontPresets.js";

/**
 * Picks the typeface pairing used across every surface on the network.
 *
 * Each tile previews in its OWN faces, applied as inline styles from the
 * preset's stacks rather than from the live CSS variables — otherwise every
 * tile would render in whatever is currently applied and the picker would
 * show one typeface eight times. This is the same reasoning as the ThemePicker
 * mocks, and it works because index.html loads every preset's faces up front.
 *
 * The specimen is deliberately concrete: a heading in the display face, a line
 * of body copy in the UI face, and the digits. Type is judged on real words
 * and on numerals — a dashboard is mostly figures — not on the family name.
 */

const Specimen = ({ preset }) => (
  <span className="block rounded-[9px] border border-hairline bg-surface px-2.5 py-2">
    <span
      className="block truncate text-[17px] font-semibold leading-[1.2] text-ink"
      style={{ fontFamily: preset.stacks.display }}
    >
      Grand Palace
    </span>
    <span
      className="mt-0.5 block truncate text-[11px] leading-[1.4] text-muted"
      style={{ fontFamily: preset.stacks.ui }}
    >
      Suite booking confirmed
    </span>
    <span
      className="mt-1 block text-[12.5px] font-semibold tabular-nums text-ink"
      style={{ fontFamily: preset.stacks.ui }}
    >
      1,234,567
    </span>
  </span>
);

export const FontPicker = ({ value, onChange }) => (
  <div>
    <p className="mb-3.5 max-w-[60ch] text-xs leading-[1.5] text-muted">
      Sets the headings and body type for this panel, every hotel panel and the guest app.
      Selecting one previews it live for you; nothing changes for anyone else until you apply it.
      Membership-card numerals stay fixed-width whichever you choose.
    </p>

    {/* Native prefixes — see the note in CardDesignPicker on why arbitrary
        [@media(...)] variants must not be stacked. */}
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
      {FONT_PRESET_KEYS.map((key) => {
        const preset = FONT_PRESETS[key];
        const active = value === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            title={preset.note}
            className={`cursor-pointer rounded-token border bg-card p-2 text-left transition-[border-color,box-shadow] duration-150 ${
              active
                ? "border-[var(--acc)] shadow-[0_0_0_2px_var(--acc)]"
                : "border-hairline hover:border-[var(--acc)]"
            }`}
          >
            <Specimen preset={preset} />

            <span className="mt-1.5 flex items-baseline justify-between gap-1">
              <b className="truncate font-display text-[12px] font-semibold">{preset.label}</b>
              {active && (
                <span className="text-[9px] font-bold uppercase tracking-[.1em] text-[var(--acc)]">
                  On
                </span>
              )}
            </span>
            {/* The face names, so an admin can match them to a brand guide. */}
            <span className="mt-0.5 block truncate text-[10.5px] leading-[1.4] text-muted">
              {preset.display === preset.ui
                ? preset.display
                : `${preset.display} · ${preset.ui}`}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
