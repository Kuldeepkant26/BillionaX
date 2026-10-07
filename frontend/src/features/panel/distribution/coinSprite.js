/**
 * Pre-rendered canvas sprites for the distribution animations.
 *
 * Gradients are expensive to build per frame and the show draws several
 * hundred coins and sparks at once, so each look is painted ONCE into an
 * offscreen canvas and stamped with drawImage afterwards — scaled, rotated and
 * squashed, but never re-shaded.
 */

const cache = new Map();

const make = (key, size, paint) => {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext("2d"), size);
  cache.set(key, canvas);
  return canvas;
};

/** A gold coin with a rim, an embossed "B" and a highlight. 96px, drawn scaled. */
export const coinSprite = () =>
  make("coin", 96, (g, s) => {
    const r = s / 2;

    const body = g.createRadialGradient(r * 0.68, r * 0.58, r * 0.08, r, r, r);
    body.addColorStop(0, "#fff6d2");
    body.addColorStop(0.35, "#ffd65c");
    body.addColorStop(0.78, "#e09e19");
    body.addColorStop(1, "#8f5a05");
    g.fillStyle = body;
    g.beginPath();
    g.arc(r, r, r - 1, 0, Math.PI * 2);
    g.fill();

    // The raised rim.
    g.lineWidth = s * 0.05;
    g.strokeStyle = "rgba(122, 76, 4, 0.55)";
    g.beginPath();
    g.arc(r, r, r * 0.74, 0, Math.PI * 2);
    g.stroke();

    // Embossed mark: a dark offset under a light face reads as stamped metal.
    g.font = `800 ${Math.round(s * 0.44)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "rgba(110, 66, 0, 0.55)";
    g.fillText("B", r + s * 0.015, r + s * 0.035);
    g.fillStyle = "rgba(255, 244, 205, 0.95)";
    g.fillText("B", r, r + s * 0.015);

    // Specular sweep across the upper left.
    const gloss = g.createLinearGradient(0, 0, s, s);
    gloss.addColorStop(0, "rgba(255,255,255,0.55)");
    gloss.addColorStop(0.4, "rgba(255,255,255,0)");
    g.fillStyle = gloss;
    g.beginPath();
    g.arc(r, r, r - 2, 0, Math.PI * 2);
    g.fill();
  });

/** A soft round glow in `color`, for trails, sparks and charging motes. */
export const glowSprite = (color) =>
  make(`glow:${color}`, 64, (g, s) => {
    const r = s / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color.replace(/[\d.]+\)$/, "0.45)"));
    grad.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

/**
 * Draws a coin that appears to spin about its vertical axis: the sprite is
 * squashed horizontally by |cos(angle)|, with a floor so it never vanishes
 * edge-on.
 */
export const drawSpinningCoin = (ctx, sprite, x, y, radius, angle, alpha = 1) => {
  const squash = Math.max(0.18, Math.abs(Math.cos(angle)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(squash, 1);
  ctx.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
  ctx.restore();
};

/** Sizes a canvas to its box at the device pixel ratio. Returns CSS size. */
export const fitCanvas = (canvas) => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
