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

  setGuestTheme: (guestTheme) => set({ guestTheme }),

  toggleGuestTheme: () =>
    set({
      guestTheme:
        get().guestTheme === GUEST_THEMES.DARK ? GUEST_THEMES.LIGHT : GUEST_THEMES.DARK,
    }),
});
