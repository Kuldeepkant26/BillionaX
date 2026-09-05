import {
  ACCENT_CATEGORY_GROUPS,
  ACCENT_PRESETS,
  CUSTOM_ACCENT,
  deriveCustomTokens,
} from "../../theme/accentPresets.js";
import { ColorWheel } from "./ColorWheel.jsx";

/**
 * Picks the colour theme used across every dashboard on the network.
 *
 * Each tile is a tiny dashboard mock drawn with inline styles from the
 * preset's own swatches — deliberately NOT the live CSS variables, so all
 * presets show their own colours at once instead of every tile following the
 * currently applied theme.
 */

const HAIRLINE = "#e4e7ec";
const CANVAS = "#f5f6f8";

const Mock = ({ swatches }) => (
  <span className="block h-[62px] overflow-hidden rounded-[9px] border border-hairline">
    <span className="flex h-full" style={{ background: CANVAS }}>
      <span className="block h-full w-[24%] flex-none" style={{ background: swatches.rail }} />
      <span className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
        <span className="block h-1.5 w-3/5 rounded-[3px]" style={{ background: swatches.soft }} />
        <span className="flex gap-1">
          <span
            className="h-4 flex-1 rounded-[4px] border bg-white"
            style={{ borderColor: HAIRLINE }}
          />
          <span
            className="h-4 flex-1 rounded-[4px] border bg-white"
            style={{ borderColor: HAIRLINE }}
          />
        </span>
        <span
          className="mt-auto block h-2 w-2/5 rounded-full"
          style={{ background: swatches.acc }}
        />
      </span>
    </span>
  </span>
);

export const ThemePicker = ({ value, customColor, onChange, onCustomColorChange }) => {
  const isCustom = value === CUSTOM_ACCENT;
  const customTokens = deriveCustomTokens(customColor);

  return (
    <div>
      <p className="mb-3.5 max-w-[60ch] text-xs leading-[1.5] text-muted">
        Recolours this panel, every hotel panel and the guest app (guests keep their own light or
        dark mode). Selecting a theme previews it live for you; nothing changes for anyone else
        until you apply it.
      </p>

      {/* Grouped into sections rather than one flat wall of tiles: at 27
          presets the flat grid gave an admin no way to narrow the choice, and
          the sections are how people actually decide — "something soft",
          "something premium" — before they compare individual colours.

          Native prefixes — see the note in CardDesignPicker on why arbitrary
          [@media(...)] variants must not be stacked. */}
      {ACCENT_CATEGORY_GROUPS.map((group) => (
        <section key={group.key} className="mb-5 last:mb-0">
          <div className="mb-2.5">
            <b className="font-display text-[13.5px] font-semibold">{group.label}</b>
            <p className="mt-0.5 max-w-[62ch] text-[11.5px] leading-[1.5] text-muted">
              {group.note}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-6">
            {group.keys.map((key) => {
              const preset = ACCENT_PRESETS[key];
              const active = value === key;
              // The custom tile previews the admin's own colour rather than
              // the registry's resting swatches.
              const swatches = preset.isCustom
                ? { rail: customTokens.rail, acc: customTokens.acc, soft: customTokens.accSoft }
                : preset.swatches;

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
                  <Mock swatches={swatches} />
                  <span className="mt-1.5 flex items-baseline justify-between gap-1">
                    <b className="truncate font-display text-[12px] font-semibold">
                      {preset.label}
                    </b>
                    {active && (
                      <span className="text-[9px] font-bold uppercase tracking-[.1em] text-[var(--acc)]">
                        On
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* The wheel only appears once Custom is the chosen theme — shown always
          it would read as a second, competing control. */}
      {isCustom && (
        <div className="mt-4 rounded-token border border-hairline bg-[var(--soft)] p-4">
          <b className="mb-1 block font-display text-[13.5px] font-semibold">Your colour</b>
          <p className="mb-3.5 max-w-[52ch] text-[11.5px] leading-[1.5] text-muted">
            Drag around the wheel for the hue, outward for intensity. The sidebar, buttons and
            charts are derived from it — text contrast is adjusted automatically so labels stay
            readable.
          </p>
          <ColorWheel value={customColor} onChange={onCustomColorChange} />
        </div>
      )}
    </div>
  );
};
