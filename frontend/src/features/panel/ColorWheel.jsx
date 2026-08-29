import { useCallback, useEffect, useRef, useState } from "react";
import { hexToHsl, hslToHex, isValidHex } from "../../theme/accentPresets.js";

/**
 * Circular hue/saturation picker with a lightness slider beside it.
 *
 * The disc is a conic hue sweep with a radial white wash, so angle is hue and
 * distance from the centre is saturation — the same mental model as a native
 * colour wheel, but themed and keyboard-operable. Lightness is a separate
 * track because a disc that also encodes it becomes a sphere nobody can aim at.
 *
 * Pointer events (not mouse) so a drag works the same with a finger, and the
 * disc captures the pointer so the drag survives leaving the circle.
 */
const SIZE = 168;

/**
 * Hex field that keeps its own draft.
 *
 * A controlled input bound straight to the colour cannot be edited: "#5b64" is
 * not a valid hex, so it would never be accepted and the field would fight
 * every keystroke. The draft holds whatever is typed; the colour only moves
 * when the text becomes a complete hex, and the draft resyncs whenever the
 * colour changes from elsewhere (the wheel, the slider, the swatch).
 */
const HexInput = ({ value, onChange }) => {
  const [draft, setDraft] = useState(value);
  // The "adjusting state on prop change" pattern from the React docs: compare
  // against the previous prop in state, not a ref, so the resync happens
  // during render without an extra pass.
  const [lastValue, setLastValue] = useState(value);

  if (value !== lastValue) {
    setLastValue(value);
    if (draft.toLowerCase() !== value.toLowerCase()) setDraft(value);
  }

  return (
    <input
      className="input font-mono uppercase"
      value={draft}
      spellCheck={false}
      maxLength={7}
      aria-label="Accent colour hex value"
      onChange={(e) => {
        const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
        setDraft(next);
        if (isValidHex(next)) {
          setLastValue(next);
          onChange(next);
        }
      }}
      onBlur={() => setDraft(value)}
    />
  );
};

export const ColorWheel = ({ value, onChange }) => {
  const discRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const safe = isValidHex(value) ? value : "#5b6474";
  const { h, s, l } = hexToHsl(safe);

  const pick = useCallback(
    (event) => {
      const disc = discRef.current;
      if (!disc) return;

      const rect = disc.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const dx = event.clientX - rect.left - cx;
      const dy = event.clientY - rect.top - cy;

      // atan2 gives -180..180 from the positive x-axis; the conic gradient
      // starts at the top, so rotate a quarter turn to keep them in step.
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (angle < 0) angle += 360;

      const radius = Math.min(cx, cy);
      const distance = Math.min(radius, Math.hypot(dx, dy));

      onChange(hslToHex(angle, (distance / radius) * 100, l));
    },
    [l, onChange]
  );

  // Bound to the window, not the disc: a fast drag outruns the element and
  // would otherwise drop the selection mid-gesture.
  useEffect(() => {
    if (!dragging) return;

    const move = (e) => pick(e);
    const up = () => setDragging(false);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, pick]);

  // Marker position: hue around, saturation out from the centre.
  const rad = ((h - 90) * Math.PI) / 180;
  const r = (s / 100) * (SIZE / 2);
  const markerX = SIZE / 2 + Math.cos(rad) * r;
  const markerY = SIZE / 2 + Math.sin(rad) * r;

  const nudge = (dh, ds) =>
    onChange(hslToHex((h + dh + 360) % 360, Math.min(100, Math.max(0, s + ds)), l));

  const onKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    const map = {
      ArrowRight: () => nudge(step, 0),
      ArrowLeft: () => nudge(-step, 0),
      ArrowUp: () => nudge(0, step),
      ArrowDown: () => nudge(0, -step),
    };
    if (map[e.key]) {
      e.preventDefault();
      map[e.key]();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div
        ref={discRef}
        role="slider"
        tabIndex={0}
        aria-label="Accent hue and saturation"
        aria-valuetext={`Hue ${Math.round(h)} degrees, saturation ${Math.round(s)} percent`}
        aria-valuenow={Math.round(h)}
        aria-valuemin={0}
        aria-valuemax={360}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setDragging(true);
          pick(e);
        }}
        onKeyDown={onKeyDown}
        className="relative flex-none cursor-crosshair rounded-full shadow-[var(--shadow-sm)] outline-none ring-offset-2 ring-offset-[var(--card)] focus-visible:ring-2 focus-visible:ring-[var(--acc)]"
        style={{
          width: SIZE,
          height: SIZE,
          touchAction: "none",
          background: `
            radial-gradient(circle at center, #fff 0%, transparent 72%),
            conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)
          `,
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
          style={{ left: markerX, top: markerY, background: safe }}
        />
      </div>

      <div className="flex min-w-[176px] flex-1 flex-col gap-3">
        <label className="block">
          <span className="label">Lightness</span>
          <input
            type="range"
            min={18}
            max={82}
            value={Math.round(l)}
            onChange={(e) => onChange(hslToHex(h, s, Number(e.target.value)))}
            className="w-full cursor-pointer"
            style={{
              accentColor: safe,
              background: "transparent",
            }}
          />
        </label>

        <label className="block">
          <span className="label">Hex</span>
          <span className="flex items-center gap-2">
            {/* The native swatch is the familiar affordance and gives the OS
                eyedropper for free; the wheel is the discoverable one. */}
            <input
              type="color"
              value={safe}
              onChange={(e) => onChange(e.target.value)}
              aria-label="Accent colour"
              className="h-9 w-11 flex-none cursor-pointer rounded-token-sm border border-hairline bg-card p-1"
            />
            <HexInput value={safe} onChange={onChange} />
          </span>
        </label>
      </div>
    </div>
  );
};
