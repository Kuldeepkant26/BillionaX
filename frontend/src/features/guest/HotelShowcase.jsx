import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./HotelShowcase.module.css";

/**
 * Shown until a hotel has uploaded its own photography.
 *
 * Deliberately hard-coded rather than seeded as database rows: these are
 * placeholders, and rows would have to be found and deleted later to tell a
 * hotel's real slides apart from ours. A hotel that adds its own CONTENT
 * entries replaces these with no migration.
 */
const FALLBACK_SLIDES = [
  {
    id: "fallback-suite",
    title: "Rooms & suites",
    caption: "Lake-facing rooms, restored heritage wing",
    imageUrl: "https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&q=75",
  },
  {
    id: "fallback-dining",
    title: "Dining",
    caption: "Regional menus and continental classics",
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1000&q=75",
  },
  {
    id: "fallback-pool",
    title: "Pool & rooftop",
    caption: "Open till midnight, all year",
    imageUrl: "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1000&q=75",
  },
  {
    id: "fallback-spa",
    title: "The spa",
    caption: "Ayurvedic and aromatherapy treatments",
    imageUrl: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1000&q=75",
  },
];

const AUTOPLAY_MS = 5000;

/**
 * The hotel's own gallery at the top of the guest home screen.
 *
 * `slides` comes from the hotel's CONTENT entries when it has any; otherwise
 * the fallback set above stands in, so the screen is never a blank rectangle
 * for a property that has not uploaded anything yet.
 */
export const HotelShowcase = ({ slides, hotelName }) => {
  const usable = (slides || []).filter((slide) => slide.imageUrl);
  const items = usable.length ? usable : FALLBACK_SLIDES;

  const [rawIndex, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef(null);

  const count = items.length;

  // Clamped during render rather than corrected in an effect: if the list
  // shrinks (a hotel replaces four slides with two) a stale index would
  // otherwise render one empty frame before the effect caught up.
  const index = count ? Math.min(rawIndex, count - 1) : 0;

  const go = useCallback((next) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  // Keeps the dots honest when the guest swipes the track directly, rather
  // than letting the indicator drift out of step with what is on screen.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const nearest = Math.round(track.scrollLeft / track.clientWidth);
    setIndex((current) => (nearest === current ? current : nearest));
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior: "smooth" });
  }, [index]);

  if (!count) return null;

  return (
    <section
      className={styles.wrap}
      aria-roledescription="carousel"
      aria-label={hotelName ? `${hotelName} gallery` : "Hotel gallery"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={styles.track} ref={trackRef} onScroll={onScroll}>
        {items.map((slide, i) => (
          <figure
            key={slide.id || slide._id || slide.imageUrl}
            className={styles.slide}
            style={{ backgroundImage: `url(${slide.imageUrl})` }}
            aria-hidden={i !== index}
          >
            <figcaption className={styles.caption}>
              <b>{slide.title}</b>
              {(slide.caption || slide.description) && (
                <span>{slide.caption || slide.description}</span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {count > 1 && (
        <div className={styles.dots} role="tablist" aria-label="Choose a slide">
          {items.map((slide, i) => (
            <button
              key={slide.id || slide._id || i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1} of ${count}`}
              className={`${styles.dot} ${i === index ? styles.dotOn : ""}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
