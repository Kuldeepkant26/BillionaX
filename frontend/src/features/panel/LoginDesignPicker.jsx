import { LOGIN_DESIGNS, LOGIN_CATEGORY_GROUPS } from "../guest/loginDesigns/registry.jsx";
import {
  ACCENT_CATEGORY_GROUPS,
  ACCENT_PRESETS,
  CUSTOM_ACCENT,
  DEFAULT_CUSTOM_COLOR,
  deriveCustomTokens,
  isValidHex,
} from "../../theme/accentPresets.js";
import styles from "./LoginDesignPicker.module.css";

/** Matches LOGIN_THEME_INHERIT / LOGIN_MODES in the API's constants. */
const INHERIT = "INHERIT";
const MODES = [
  { key: "AUTO", label: "Auto", note: "Follows each guest's own light/dark choice." },
  { key: "LIGHT", label: "Light", note: "Always the light ground." },
  { key: "DARK", label: "Dark", note: "Always the dark ground." },
];

/** The three-band swatch each accent preset already ships. */
const Swatch = ({ presetKey }) => {
  const preset = ACCENT_PRESETS[presetKey];
  if (!preset) return null;
  const { rail, acc, soft } = preset.swatches;
  return (
    <span className="flex h-4 w-9 shrink-0 overflow-hidden rounded-[5px] border border-hairline">
      <i className="block h-full w-1/3" style={{ background: rail }} />
      <i className="block h-full w-1/3" style={{ background: acc }} />
      <i className="block h-full w-1/3" style={{ background: soft }} />
    </span>
  );
};

/* Defined at module scope, not inside ThemeControls: a component created
   during render is a new type every pass, so React unmounts and remounts the
   whole row on every keystroke. */
const ThemeOption = ({ presetKey, label, swatch, active, onPick }) => {
  const on = active === presetKey;
  return (
    <button
      type="button"
      onClick={() => onPick(presetKey)}
      aria-pressed={on}
      className={`flex cursor-pointer items-center gap-2 rounded-token border px-2.5 py-2 text-left transition-[border-color,box-shadow] duration-150 ${
        on ? "border-accent shadow-[0_0_0_2px_var(--acc)]" : "border-hairline hover:border-accent"
      }`}
    >
      {swatch}
      <b className="truncate text-[11.5px] font-semibold">{label}</b>
    </button>
  );
};

/**
 * The sign-in screen's own colour, independent of the network accent.
 *
 * "Match the app" is first and is the default, so the common case is one
 * click and the override is opt-in. Everything else is the SAME 27 presets
 * the network theme offers — reusing them rather than inventing a second
 * palette set means no new colour system to keep in step, and every option is
 * already contrast-checked in both modes.
 */
const ThemeControls = ({ theme, customColor, mode, onChange }) => {
  const active = theme || INHERIT;
  const hexValid = isValidHex(customColor || DEFAULT_CUSTOM_COLOR);
  const pick = (loginTheme) => onChange({ loginTheme });

  return (
    <div className="mb-6">
      <div className="mb-2.5">
        <b className="font-display text-[13.5px] font-semibold">Sign-in colour</b>
        <p className="mt-0.5 max-w-[62ch] text-[11.5px] leading-[1.5] text-muted">
          By default the sign-in screen uses the network colour theme. Override it here to give the
          front door its own palette — the rest of the app is unaffected.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        <ThemeOption
          presetKey={INHERIT}
          active={active}
          onPick={pick}
          label="Match the app"
          swatch={
            <span className="flex h-4 w-9 shrink-0 items-center justify-center rounded-[5px] border border-dashed border-hairline text-[8px] font-bold uppercase tracking-[0.08em] text-muted">
              App
            </span>
          }
        />
        {ACCENT_CATEGORY_GROUPS.flatMap((group) => group.keys).map((key) => (
          <ThemeOption
            key={key}
            presetKey={key}
            active={active}
            onPick={pick}
            label={ACCENT_PRESETS[key].label}
            swatch={<Swatch presetKey={key} />}
          />
        ))}
        <ThemeOption
          presetKey={CUSTOM_ACCENT}
          active={active}
          onPick={pick}
          label="Custom colour"
          swatch={
            <span
              className="h-4 w-9 shrink-0 rounded-[5px] border border-hairline"
              style={{ background: hexValid ? customColor || DEFAULT_CUSTOM_COLOR : DEFAULT_CUSTOM_COLOR }}
            />
          }
        />
      </div>

      {active === CUSTOM_ACCENT && (
        <label className="mt-2.5 flex items-center gap-2.5 text-[11.5px] text-muted">
          <input
            type="color"
            value={hexValid ? customColor || DEFAULT_CUSTOM_COLOR : DEFAULT_CUSTOM_COLOR}
            onChange={(e) => onChange({ loginThemeCustomColor: e.target.value })}
            className="h-8 w-12 cursor-pointer rounded-md border border-hairline bg-transparent p-0.5"
            aria-label="Sign-in accent colour"
          />
          {/* The shades around it are derived from this one hue, so the admin
              picks a colour rather than a whole palette. */}
          <span>The button, focus ring and backdrop are derived from this colour.</span>
        </label>
      )}

      <div className="mt-4">
        <b className="font-display text-[13.5px] font-semibold">Sign-in light / dark</b>
        <p className="mt-0.5 mb-2 max-w-[62ch] text-[11.5px] leading-[1.5] text-muted">
          Several designs are built for one ground. Forcing it here changes the sign-in screen only
          — guests keep their own choice everywhere else in the app.
        </p>
        <div className="flex gap-1.5 rounded-full bg-chip p-1" role="group" aria-label="Sign-in mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onChange({ loginMode: m.key })}
              aria-pressed={(mode || "AUTO") === m.key}
              title={m.note}
              className={`cursor-pointer rounded-full border-0 px-3 py-1.5 font-[inherit] text-[12px] font-semibold transition-[background,color] duration-150 ${
                (mode || "AUTO") === m.key
                  ? "bg-surface text-ink shadow-[var(--shadow-sm)]"
                  : "bg-transparent text-muted"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * The attributes that paint a preview tile in the CHOSEN sign-in palette.
 *
 * Mirrors useLoginTheme on the guest side, deliberately duplicated rather
 * than imported: that one reads the public config payload, this one reads the
 * admin's unsaved form state, and collapsing them would mean one function
 * pretending two different shapes are the same.
 */
const previewThemeProps = (theme, customColor, mode) => {
  const props = {};
  if (mode === "LIGHT") props["data-theme"] = "lumen";
  if (mode === "DARK") props["data-theme"] = "emerald-noir";

  if (theme && theme !== INHERIT) {
    props["data-accent"] = theme;
    if (theme === CUSTOM_ACCENT) {
      const t = deriveCustomTokens(customColor || DEFAULT_CUSTOM_COLOR);
      props.style = {
        "--acc": t.acc,
        "--acc-fg": t.accFg,
        "--acc2": t.acc2,
        "--acc-soft": t.accSoft,
        "--hero": t.hero,
      };
    }
  }
  return props;
};

/**
 * Picks the sign-in screen every guest meets, network-wide.
 *
 * Previews render the REAL artwork components from the registry, not
 * screenshots — so what the admin approves is what guests get, and a design
 * that breaks cannot ship looking fine here. The form inside each preview is
 * a sketch rather than the live form: it is the same three shapes for every
 * design (two fields and a button), and mounting nine real OTP forms on a
 * settings page would be nine live inputs nobody can type in.
 *
 * The tiles are painted in the CHOSEN sign-in palette and ground, not the
 * panel's own accent — so changing the colour above re-skins every tile, and
 * what the admin compares is what guests will actually meet.
 */
export const LoginDesignPicker = ({ value, onChange, theme, customColor, mode, onThemeChange }) => {
  const previewTheme = previewThemeProps(theme, customColor, mode);

  return (
  <div>
    <p className="mb-3.5 max-w-[56ch] text-xs leading-[1.5] text-muted">
      Applies to the sign-in screen on every hotel&rsquo;s QR link. Guests see the change the next
      time they open it.
    </p>

    <ThemeControls theme={theme} customColor={customColor} mode={mode} onChange={onThemeChange} />

    {LOGIN_CATEGORY_GROUPS.map((group) => (
      <section key={group.key} className="mb-5 last:mb-0">
        <div className="mb-2.5">
          <b className="font-display text-[13.5px] font-semibold">{group.label}</b>
          <p className="mt-0.5 max-w-[62ch] text-[11.5px] leading-[1.5] text-muted">{group.note}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {group.keys.map((key) => {
            const design = LOGIN_DESIGNS[key];
            const { chrome } = design;
            const Art = chrome.art;
            const active = value === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange(key)}
                aria-pressed={active}
                title={design.note}
                className={`cursor-pointer rounded-token border bg-card p-2 text-left transition-[border-color,box-shadow] duration-150 ${
                  active
                    ? "border-[var(--acc)] shadow-[0_0_0_2px_var(--acc)]"
                    : "border-hairline hover:border-[var(--acc)]"
                }`}
              >
                {/* A miniature of the real screen: the design's own art in the
                    band, its join shape, and a sketch of the form below. */}
                {/* The tile carries the chosen sign-in palette and ground, so
                    what the admin compares is what guests will actually see —
                    not the network accent the panel around it is painted in.
                    data-accent / data-theme re-point the tokens for this
                    subtree exactly as they do on the real screen. */}
                <span
                  {...previewTheme}
                  className={`${styles.preview} ${styles[`band_${chrome.band}`]} ${
                    chrome.onDark ? styles.onDark : ""
                  }`}
                >
                  <span className={styles.art}>
                    <Art />
                  </span>

                  {/* The real mark, not a grey placeholder — the brand is
                      most of what distinguishes these tiles from each other,
                      and a bar told the admin nothing. */}
                  <span
                    className={`${styles.brand} ${
                      chrome.brand === "center" ? styles.brandCenter : ""
                    }`}
                  >
                    <img src="/logo.png" alt="" className={styles.mark} />
                    <i className={styles.wordmark}>Billionax</i>
                  </span>

                  <span className={`${styles.sheet} ${styles[`join_${chrome.join}`]}`}>
                    <i className={`${styles.line} ${styles.lineTitle}`} />
                    <i className={`${styles.field}`} />
                    <i className={`${styles.field}`} />
                    <i className={styles.cta} />
                  </span>
                </span>

                <div className="mt-2 flex items-baseline justify-between gap-1.5">
                  <b className="truncate font-display text-[12.5px] font-semibold">
                    {design.label}
                  </b>
                  {active && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-accent">
                      On
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    ))}
  </div>
  );
};
