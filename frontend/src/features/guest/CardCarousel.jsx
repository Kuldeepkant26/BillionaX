import { useCallback, useEffect, useRef, useState } from "react";
import { MembershipCard } from "./MembershipCard.jsx";
import styles from "./CardCarousel.module.css";

/**
 * The membership card and the brand panel, as a two-slide carousel.
 *
 * Modelled on HotelShowcase deliberately — same scroll-snap track, same dots,
 * same pause rules — so the home screen has ONE carousel idiom rather than two
 * that behave differently. The differences from that component are the ones
 * this slot actually needs:
 *
 *   - It leads with the card and returns to it. The balance is what a guest
 *     opens the app for, so the brand panel is a visitor, not an equal.
 *   - The dwell is asymmetric for the same reason (see SHOW_MS).
 *   - Every slide is the card's own 380/240 box, so nothing below it moves as
 *     the track advances.
 */

/*
 * How long each slide holds.
 *
 * The card sits far longer than the panel: a guest checking their balance
 * should not have it slide away while they read it, and the panel is a
 * message they only need once. HotelShowcase's flat 5s would have the card
 * off screen roughly half the time this screen is open.
 */
const SHOW_MS = { card: 9000, brand: 5000 };

/* The panel's own copy. Hard-coded rather than fetched: it is brand messaging
   that applies network-wide, not a property's content. */
const BRAND = {
  wordmark: "Billionax",
  lines: ["Luxury for everyone.", "Privileges for members."],
  body:
    "Earn Billionax Coins on every stay. Redeem exclusive privileges across dining, wellness, upgrades and luxury experiences.",
  /* Split rather than one string: the figure is set in the display face and
     the label and period in the UI face, which one run of text cannot do. */
  valueLabel: "Benefits worth up to",
  valueFigure: "₹25,000+",
  valuePeriod: "per year*",
};

const SLIDES = ["card", "brand"];

export const CardCarousel = ({ membership, guestName, hotelName }) => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const trackRef = useRef(null);
  /*
   * Set while WE are scrolling the track rather than the guest.
   *
   * Same guard as HotelShowcase: a smooth scrollTo emits scroll events all the
   * way, and mid-flight `scrollLeft / clientWidth` still rounds to the slide
   * being left. Without this the handler reads that as "the guest went back",
   * resets the index, and the [index] effect scrolls back — an autoplay tick
   * that undoes itself.
   */
  const animating = useRef(false);

  const count = SLIDES.length;
  const go = useCallback((next) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused) return undefined;
    // A timeout per slide rather than one interval, because the two dwell
    // times differ — an interval would have to be the shorter of them.
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), SHOW_MS[SLIDES[index]]);
    return () => clearTimeout(timer);
  }, [index, paused, count]);

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
    if (Math.abs(track.scrollLeft - target) < 2) return undefined;

    animating.current = true;
    track.scrollTo({ left: target, behavior: "smooth" });

    // scrollend is not in Safari yet, so a timer closes the guard instead.
    const done = setTimeout(() => {
      animating.current = false;
    }, 600);

    return () => clearTimeout(done);
  }, [index]);

  return (
    <section
      className="relative"
      aria-roledescription="carousel"
      aria-label="Your membership"
      /* Mouse-only pause: on a phone pointerenter fires on tap and
         pointerleave never does, so touch would stop the rotation for good.
         Focus always pauses — someone tabbing here is reading. */
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      onPointerCancel={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className={`flex ${styles.track}`} ref={trackRef} onScroll={onScroll}>
        <div className={styles.slide}>
          <MembershipCard membership={membership} guestName={guestName} hotelName={hotelName} />
        </div>

        {/*
          aria-hidden while it is off screen so a screen reader does not read
          the marketing copy into the middle of the balance, and inert so its
          text cannot take focus from behind the card.
        */}
        {/* `inert` takes a real boolean in React 19 — an empty string is
            treated as false, which silently left the panel focusable. */}
        <div className={styles.slide} aria-hidden={index !== 1} inert={index !== 1}>
          {/*
            Three zones, not a stack of text: a header rule, the statement, and
            a value footer divided off at the bottom. The space is distributed
            between them rather than pooling under the last line, which is what
            left the flat version looking half empty.
          */}
          <article className={styles.brand}>
            <span className={styles.sheen} aria-hidden="true" />

            <header className={styles.brandHead}>
              <span className={styles.wordmark}>{BRAND.wordmark}</span>
              <span className={styles.rule} aria-hidden="true" />
            </header>

            <div className={styles.brandBody}>
              <b className={styles.lines}>
                {BRAND.lines.map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </b>
              <p className={styles.body}>{BRAND.body}</p>
            </div>

            <footer className={styles.valueRow}>
              <u className={styles.valueLabel}>{BRAND.valueLabel}</u>
              <b className={styles.valueFigure}>
                {BRAND.valueFigure}
                <span>{BRAND.valuePeriod}</span>
              </b>
            </footer>
          </article>
        </div>
      </div>

      <div className={styles.dots} role="tablist" aria-label="Choose a slide">
        {SLIDES.map((slide, i) => (
          <button
            key={slide}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={slide === "card" ? "Your membership card" : "About Billionax"}
            className={`${styles.dot} ${i === index ? styles.dotOn : ""}`}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </section>
  );
};
