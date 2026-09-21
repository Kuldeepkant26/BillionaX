import {
  CUSTOM_ACCENT,
  deriveCustomTokens,
  resolveAccent,
} from "../../../theme/accentPresets.js";

/**
 * Resolves the sign-in screen's own colour and ground.
 *
 * THE PROBLEM THIS SOLVES. Every other guest surface takes the network accent
 * and the guest's light/dark choice, and that is correct — they are one app.
 * The sign-in screen is the exception: it is pure brand, with no data and no
 * navigation, so a network running a restrained accent may still want a
 * dramatic front door. These three settings let an admin say so without
 * touching a single other screen.
 *
 * HOW THE OVERRIDE IS APPLIED. Both axes are expressed as ATTRIBUTES on the
 * login page's own wrapper, not as a pile of inline colours:
 *
 *   data-accent  the palette. Every preset already exists in themes.css as a
 *                `[data-accent="KEY"]` block, so setting the attribute
 *                re-points --acc/--hero/--acc-soft for that subtree and
 *                nothing else. No colour is copied out of the stylesheet.
 *   data-theme   the ground, when the admin forces light or dark.
 *
 * CUSTOM is the one case that cannot work that way — there is no stylesheet
 * block for a hex nobody has seen — so it derives its tokens and returns them
 * as inline variables, exactly as useAccentStyle does for the app.
 *
 * NOTHING HERE IS PERSISTED. The guest's own theme is never written, so the
 * app returns to their choice the moment they are signed in.
 */

/** Matches LOGIN_THEME_INHERIT in the API's constants. */
export const LOGIN_THEME_INHERIT = "INHERIT";

/** Matches LOGIN_MODES in the API's constants. */
export const LOGIN_MODES = { AUTO: "AUTO", LIGHT: "LIGHT", DARK: "DARK" };

const THEME_FOR_MODE = {
  [LOGIN_MODES.LIGHT]: "lumen",
  [LOGIN_MODES.DARK]: "emerald-noir",
};

/**
 * @param config  the public config payload (may be partial or empty — this
 *                screen has to paint before, and even without, that call)
 * @returns props to spread onto the login page's wrapper element
 */
export const useLoginTheme = (config) => {
  const theme = config?.loginTheme || LOGIN_THEME_INHERIT;
  const mode = config?.loginMode || LOGIN_MODES.AUTO;

  const props = {};

  // AUTO leaves data-theme off entirely, so the wrapper inherits whatever
  // GuestLayout put on the root and the guest's toggle still decides.
  const forced = THEME_FOR_MODE[mode];
  if (forced) props["data-theme"] = forced;

  if (theme !== LOGIN_THEME_INHERIT) {
    if (theme === CUSTOM_ACCENT) {
      // No stylesheet block exists for an arbitrary hex, so the tokens are
      // derived and handed over inline. deriveCustomTokens already clamps
      // lightness and picks a foreground that holds contrast.
      const t = deriveCustomTokens(config?.loginThemeCustomColor);
      props["data-accent"] = CUSTOM_ACCENT;
      props.style = {
        "--acc": t.acc,
        "--acc-fg": t.accFg,
        "--acc2": t.acc2,
        "--acc-soft": t.accSoft,
        "--hero": t.hero,
      };
    } else {
      // resolveAccent falls back to the default for a key this build does not
      // know, so a preset removed from the frontend cannot leave the sign-in
      // screen unpainted.
      props["data-accent"] = resolveAccent(theme);
    }
  }

  return props;
};
