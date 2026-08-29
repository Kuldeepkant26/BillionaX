import { useEffect, useState } from "react";

/**
 * Chart colours, read from the live theme tokens.
 *
 * Recharts needs real colour strings (it measures and interpolates them), so
 * `var(--acc)` cannot be handed straight to a <Bar fill>. This hook resolves
 * the computed values off the themed root and re-reads them whenever the
 * admin-chosen accent changes, which keeps every chart in step with the
 * palette without duplicating hex codes anywhere.
 *
 * The series order is fixed: slot 0 is the accent, slot 1 the slate
 * companion. Fixed order matters — colour must follow the entity, so a chart
 * that drops a series never repaints the survivors.
 */

const read = (name, fallback) => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  return value || fallback;
};

export const useChartTheme = () => {
  const [theme, setTheme] = useState(() => resolve());

  // The accent lives on <body> as data-accent; observing the attribute is
  // cheaper and more reliable than threading the store value in, and it also
  // catches the light/dark flip on the guest side.
  useEffect(() => {
    const update = () => setTheme(resolve());
    update();

    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-accent", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
};

function resolve() {
  return {
    // Slot 1 is --chart2, declared per preset in themes.css: no single
    // companion hue stays separable from every accent, so each palette
    // brings its own validated partner.
    series: [read("--acc", "#d8411f"), read("--chart2", "#4a5d80")],
    accSoft: read("--acc-soft", "#fbe7df"),
    grid: read("--line", "#e4e7ec"),
    axis: read("--dim", "#667085"),
    ink: read("--fg", "#101318"),
    card: read("--card", "#ffffff"),
    ok: read("--ok", "#2f6b4f"),
    bad: read("--bad", "#a6402c"),
  };
}
