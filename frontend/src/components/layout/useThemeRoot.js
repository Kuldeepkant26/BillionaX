import { useEffect } from "react";
import { useAppStore } from "../../store/useAppStore.js";
import { CUSTOM_ACCENT, deriveCustomTokens } from "../../theme/accentPresets.js";
import { resolveFont } from "../../theme/fontPresets.js";

/** Browser-chrome colour per theme — iOS status bar, Android nav bar. */
const THEME_COLORS = {
  "emerald-noir": "#0B0A08",
  lumen: "#FFFFFF",
  "ink-minimal": "#F5F6F8",
};

/** The custom accent's tokens, as CSS custom property names. */
const CUSTOM_VARS = [
  "--acc",
  "--acc-fg",
  "--acc2",
  "--acc-soft",
  "--chart2",
  "--rail",
  "--railacttx",
  "--hero",
];

/**
 * Mirrors the active theme onto <body>.
 *
 * Portalled UI (modals, toasts) renders outside the layout subtree, so without
 * this it would lose the scoped CSS variables and fall back to unstyled.
 *
 * The initial paint is handled by the inline script in index.html; this keeps
 * body and the theme-color meta in sync afterwards, when the guest toggles.
 */
export const useThemeRoot = (theme) => {
  const accent = useAppStore((s) => s.accent);
  const accentCustom = useAppStore((s) => s.accentCustom);
  const font = useAppStore((s) => s.font);

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    // The accent must ride on the SAME element as data-theme: portalled UI
    // resolves its accent tokens from body, and the dark-mode corrections in
    // themes.css are compound [data-theme][data-accent] selectors.
    document.body.setAttribute("data-accent", accent);
    // And the font, for the same reason: a modal rendered through a portal
    // would otherwise fall back to the theme's default pairing.
    document.body.setAttribute("data-font", resolveFont(font));

    // The custom accent has no static CSS block to live in — its tokens are
    // derived from one hue at runtime and written straight onto body, where
    // they inherit into both the app and any portal.
    if (accent === CUSTOM_ACCENT) {
      const t = deriveCustomTokens(accentCustom);
      document.body.style.setProperty("--acc", t.acc);
      document.body.style.setProperty("--acc-fg", t.accFg);
      document.body.style.setProperty("--acc2", t.acc2);
      document.body.style.setProperty("--acc-soft", t.accSoft);
      document.body.style.setProperty("--chart2", t.chart2);
      document.body.style.setProperty("--rail", t.rail);
      document.body.style.setProperty("--railacttx", t.rail);
      document.body.style.setProperty("--hero", t.hero);
    } else {
      // Clear them, or a switch back to a preset would keep the custom hue.
      CUSTOM_VARS.forEach((name) => document.body.style.removeProperty(name));
    }

    // Left fixed, the status bar would clash the moment the theme flips.
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute("content");
    meta?.setAttribute("content", THEME_COLORS[theme] || THEME_COLORS["ink-minimal"]);

    return () => {
      document.body.removeAttribute("data-theme");
      document.body.removeAttribute("data-accent");
      document.body.removeAttribute("data-font");
      CUSTOM_VARS.forEach((name) => document.body.style.removeProperty(name));
      if (previous) meta?.setAttribute("content", previous);
    };
  }, [theme, accent, accentCustom, font]);
};

/**
 * The same derived tokens as inline styles, for the themed root <div>.
 *
 * body carries them for portals; the layout root needs its own copy because
 * the [data-accent="CUSTOM"] block on it would otherwise leave --acc at the
 * theme's fallback for everything inside.
 */
export const useAccentStyle = () => {
  const accent = useAppStore((s) => s.accent);
  const accentCustom = useAppStore((s) => s.accentCustom);

  if (accent !== CUSTOM_ACCENT) return undefined;

  const t = deriveCustomTokens(accentCustom);
  return {
    "--acc": t.acc,
    "--acc-fg": t.accFg,
    "--acc2": t.acc2,
    "--acc-soft": t.accSoft,
    "--chart2": t.chart2,
    "--rail": t.rail,
    "--railacttx": t.rail,
    "--hero": t.hero,
  };
};

/**
 * The resolved font-preset key for the themed root <div>.
 *
 * body carries it for portals (see useThemeRoot); the layout root needs its
 * own copy because the font tokens are declared per [data-theme] block, and a
 * root without [data-font] would resolve them to the theme's default pairing
 * for everything inside it.
 *
 * A hook rather than a store read in each of the four roots, so resolveFont
 * cannot be forgotten at one of them and leave a stale key painting nothing.
 */
export const useFontRoot = () => resolveFont(useAppStore((s) => s.font));
