import { useEffect, useState } from "react";

/**
 * Returns `value` only after it has stopped changing for `delay` ms.
 *
 * Search boxes bind the raw value to the input (so typing stays responsive)
 * and the debounced value to the request key. Without this, every keystroke is
 * its own HTTP round-trip.
 */
export const useDebounced = (value, delay = 350) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
