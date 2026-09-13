import { useRef, useState } from "react";
import { feedImage } from "../../utils/upload.js";
import styles from "./FeedCarousel.module.css";

/**
 * One frame, with a placeholder when the image will not load.
 *
 * Not defensive padding: this Cloudinary account has strict transformations
 * enabled, so a DERIVED url can 404 even when the original is fine. Without
 * this the reader gets a tall empty well with alt text sitting in it, which
 * reads as a broken app rather than a missing photo.
 */
const Frame = ({ src, alt, eager }) => {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span className={`${styles.frame} ${styles.broken}`} role="img" aria-label={alt || "Image unavailable"}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 5.5h18v13H3zM3 15l5-5 3.5 3.5L15 10l6 5.5" />
          <circle cx="8.5" cy="9" r="1.4" />
        </svg>
        <i>Image unavailable</i>
      </span>
    );
  }

  return (
    <img
      className={styles.frame}
      src={feedImage(src, 460)}
      alt={alt}
      // Only the first image is worth fetching eagerly; a feed of ten 10-image
      // posts would otherwise request a hundred files before the reader has
      // scrolled anywhere.
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onError={() => setBroken(true)}
    />
  );
};

/**
 * The image carousel on a post.
 *
 * Native scroll-snap rather than a carousel library: the browser already does
 * momentum, rubber-banding and touch handling better than any JS
 * reimplementation, and the app ships no such dependency anyway. The only
 * JavaScript here is reading which page you landed on, for the dots.
 *
 * A single image renders as a plain <img> — no track, no dots, no listener.
 */
export const FeedCarousel = ({ images = [], alt = "" }) => {
  const [index, setIndex] = useState(0);
  const trackRef = useRef(null);

  if (!images.length) return null;

  const single = images.length === 1;

  // Derived from scroll position rather than tracked on every frame: the value
  // is only read to paint the dots, so rounding at rest is enough.
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    setIndex((prev) => (prev === next ? prev : next));
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={single ? undefined : onScroll}
        className={`${styles.track} ${single ? "" : styles.snap}`}
      >
        {images.map((src, i) => (
          <Frame key={src} src={src} alt={i === 0 ? alt : ""} eager={i === 0} />
        ))}
      </div>

      {!single && (
        <>
          <span className={styles.counter} aria-hidden="true">
            {index + 1}/{images.length}
          </span>
          <span className={styles.dots} role="presentation">
            {images.map((src, i) => (
              <i key={src} className={i === index ? styles.dotOn : styles.dot} />
            ))}
          </span>
        </>
      )}
    </div>
  );
};

export default FeedCarousel;
