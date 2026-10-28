import { useLayoutEffect, useRef, useState } from "react";
import { MembershipCard } from "../guest/MembershipCard.jsx";

/**
 * The membership card at any width, drawn at its design size and scaled.
 *
 * The card designs place their text in fixed pixels on a 380x240 face, which
 * suits the guest app where the card is always phone-width. The landing page
 * shows it smaller — three abreast, or inside the product shot on a phone —
 * and below roughly 320px the member number and the name run into each other.
 * Scaling the whole face keeps every design exactly as drawn.
 *
 * Measured in a layout effect so the first paint is already the right size.
 */

const DESIGN_WIDTH = 380;

export const ScaledCard = (props) => {
  const boxRef = useRef(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;

    const measure = () => setScale(box.clientWidth / DESIGN_WIDTH);
    measure();

    if (!("ResizeObserver" in window)) return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="relative aspect-[380/240] w-full">
      <div
        className="absolute left-0 top-0 w-[380px] origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        <MembershipCard {...props} />
      </div>
    </div>
  );
};
