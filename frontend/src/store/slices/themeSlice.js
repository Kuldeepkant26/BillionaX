import {
  DEFAULT_ACCENT,
  DEFAULT_CUSTOM_COLOR,
  isValidHex,
  resolveAccent,
} from "../../theme/accentPresets.js";

export const GUEST_THEMES = { LIGHT: "lumen", DARK: "emerald-noir" };

/**
 * Guest-app theme preference.
 *
 * Light by default, and deliberately NOT reading prefers-color-scheme: this is
 * a brand-controlled consumer surface whose default is the light one. What the
 * guest explicitly chooses is what persists.
 *
 * `guestTheme` must be listed in the store's partialize allowlist, or the
 * toggle silently forgets itself on reload.
 */
export const createThemeSlice = (set, get) => ({
  guestTheme: GUEST_THEMES.LIGHT,

  // The network-wide colour preset the main admin chose (accent, rail, hero).
  // Orthogonal to guestTheme: accent picks the hue, guestTheme picks the
  // light/dark neutrals it sits on. Persisted (see partialize) so reloads
  // paint in the right colour before the server confirms it.
  accent: DEFAULT_ACCENT,

  // The hue behind accent === "CUSTOM".
  accentCustom: DEFAULT_CUSTOM_COLOR,

  // Run through resolveAccent so a key from a newer/older API build can never
  // put an unpaintable value into the persisted store.
  setAccent: (accent, accentCustom) =>
    set({
      accent: resolveAccent(accent),
      ...(isValidHex(accentCustom) ? { accentCustom } : null),
    }),

  setGuestTheme: (guestTheme) => set({ guestTheme }),

  toggleGuestTheme: () =>
    set({
      guestTheme:
        get().guestTheme === GUEST_THEMES.DARK ? GUEST_THEMES.LIGHT : GUEST_THEMES.DARK,
    }),
});
