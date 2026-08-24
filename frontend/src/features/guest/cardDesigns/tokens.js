import { useId } from "react";

/**
 * Non-component exports for the card designs.
 *
 * Kept out of the .jsx files so React Fast Refresh keeps working: a module
 * that exports both components and plain values loses its refresh boundary,
 * and editing a card would force a full reload instead of a hot swap.
 */

/** The 380x240 viewBox every family draws into. */
export const VB = { w: 380, h: 240 };

/** Raised type (light from above); pairs with debossed for the metal families. */
export const EMBOSS = { textShadow: "0 1px 0 rgba(255,255,255,.22),0 -1px 0 rgba(0,0,0,.6)" };
export const DEBOSS = { textShadow: "0 -1px 0 rgba(255,255,255,.18),0 1px 1px rgba(0,0,0,.7)" };

/**
 * Scopes a set of SVG def ids to one component instance.
 *
 * SVG ids are DOCUMENT-global: the admin picker renders eight cards at once,
 * and duplicate ids would make every card resolve url(#foil) to the first
 * definition on the page — so Gold and Platinum would paint in Silver's
 * gradient. Never hardcode these back.
 *
 * useId is unique per component instance WITHIN one render tree, which is what
 * the app always does. It does NOT hold across separate renderToStaticMarkup
 * calls, which each restart the counter — so a script that renders every card
 * in its own call will show duplicate ids. That is an artefact of the script,
 * not of the cards; render them inside one tree to check.
 */
export const useSvgIds = (...names) => {
  const base = useId().replace(/:/g, "");
  return names.reduce((out, name) => ({ ...out, [name]: `${name}-${base}` }), {});
};
