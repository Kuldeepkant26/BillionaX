import { useEffect } from "react";

/** Browser-chrome colour per theme — iOS status bar, Android nav bar. */
const THEME_COLORS = {
  "emerald-noir": "#0B0A08",
  lumen: "#FFFFFF",
  "ink-minimal": "#F7F4EC",
};

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
  useEffect(() => {
    document.body.setAttribute("data-theme", theme);

    // Left fixed, the status bar would clash the moment the theme flips.
    const meta = document.querySelector('meta[name="theme-color"]');
    const previous = meta?.getAttribute("content");
    meta?.setAttribute("content", THEME_COLORS[theme] || THEME_COLORS["ink-minimal"]);

    return () => {
      document.body.removeAttribute("data-theme");
      if (previous) meta?.setAttribute("content", previous);
    };
  }, [theme]);
};
