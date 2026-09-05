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
  /*
   * Set while the track is being scrolled BY US rather than by the guest.
   *
   * A smooth scrollTo fires a stream of scroll events on the way, and partway
   * through the animation `scrollLeft / clientWidth` still rounds to the slide
   * we are leaving. Without this guard the handler below read that as "the
   * guest went back", reset the index, and the [index] effect then scrolled
   * back to the previous slide — so an autoplay tick undid itself and the
   * carousel sat still.
   */
  const animating = useRef(false);

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
  // Ignored while we are the ones scrolling — see `animating`.
  const onScroll = () => {
    const track = trackRef.current;
    if (!track || animating.current) return;
    const nearest = Math.round(track.scrollLeft / track.clientWidth);
    setIndex((current) => (nearest === current ? current : nearest));
  };

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const target = index * track.clientWidth;
    // Already there (the guest just swiped here) — scrolling again would fight
    // the snap they are still settling into.
    if (Math.abs(track.scrollLeft - target) < 2) return undefined;

    animating.current = true;
    track.scrollTo({ left: target, behavior: "smooth" });

    // scrollend is the honest signal but is not in Safari yet, so a timer
    // closes the guard: long enough for a smooth scroll to land, short enough
    // that a swipe right after a tick is still tracked.
    const done = setTimeout(() => {
      animating.current = false;
    }, 600);

    return () => clearTimeout(done);
  }, [index]);

  if (!count) return null;

  return (
    <section
      className="relative mt-4 rounded-token overflow-hidden shadow-[var(--shadow)]"
      aria-roledescription="carousel"
      aria-label={hotelName ? `${hotelName} gallery` : "Hotel gallery"}
      /*
       * Pause on hover only where hovering is a deliberate act. On a phone a
       * tap fires pointerenter and nothing ever fires pointerleave, so the
       * carousel would stop for good the first time a guest touched it — the
       * pointer query keeps the pause for mice and leaves touch alone.
       *
       * Focus always pauses: someone tabbing through the dots is reading.
       */
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      onPointerCancel={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={`flex ${styles.track}`} ref={trackRef} onScroll={onScroll}>
        {items.map((slide, i) => (
          <figure
            key={slide.id || slide._id || slide.imageUrl}
            className={`relative h-[192px] m-0 flex items-end ${styles.slide}`}
            style={{ backgroundImage: `url(${slide.imageUrl})` }}
            aria-hidden={i !== index}
          >
            <figcaption className="relative z-[1] px-4 pt-3.5 pb-[18px] text-white">
              <b className="block font-display text-[17px] font-semibold tracking-[-0.2px]">{slide.title}</b>
              {(slide.caption || slide.description) && (
                <span className="block text-[11.5px] opacity-[0.86] mt-[3px] leading-[1.45]">
                  {slide.caption || slide.description}
                </span>
              )}
            </figcaption>
          </figure>
        ))}
      </div>

      {count > 1 && (
        <div className="absolute right-3.5 bottom-3.5 z-[2] flex gap-[5px]" role="tablist" aria-label="Choose a slide">
          {items.map((slide, i) => (
            <button
              key={slide.id || slide._id || i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1} of ${count}`}
              className={`h-1.5 p-0 border-0 rounded-full cursor-pointer transition-[width,background] duration-200 ${
                styles.noMotion
              } ${
                // The active dot stretches rather than changing colour — it
                // stays legible on any photograph, which a colour swap would not.
                i === index ? "w-[18px] bg-white" : "w-1.5 bg-white/45"
              }`}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
