import { useEffect, useState } from "react";

const secondsUntil = (target) =>
  target ? Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)) : 0;

/**
 * Seconds remaining until `target`, ticking once a second. 0 when past.
 *
 * The value is derived during render from `now`, so changing the target does
 * not need an effect to resynchronise state.
 */
export const useCountdown = (target) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return undefined;

    const tick = () => setNow(Date.now());
    tick();

    const id = setInterval(() => {
      if (secondsUntil(target) <= 0) clearInterval(id);
      tick();
    }, 1000);

    return () => clearInterval(id);
  }, [target]);

  // `now` is read so the render re-derives on each tick.
  void now;
  return secondsUntil(target);
};
