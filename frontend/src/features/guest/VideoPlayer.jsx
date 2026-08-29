import { useEffect, useRef, useState } from "react";
import { videoPoster, videoStream } from "../../utils/upload.js";
import styles from "./VideoPlayer.module.css";

/**
 * The player itself: a native <video> with custom chrome.
 *
 * Native rather than a library — the element already handles buffering, codec
 * negotiation, picture-in-picture and the OS media controls, and a library
 * would be the heaviest dependency in the app for a single 16:9 box. What is
 * custom is only the overlay, so it can wear the app's own theme.
 *
 * Autoplay is MUTED, because every mobile browser blocks a sound-on autoplay
 * and the failed promise leaves the poster frozen with no way in. The first
 * tap unmutes.
 */

const fmt = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export const VideoPlayer = ({ src, poster, title }) => {
  const videoRef = useRef(null);
  const hideTimer = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [started, setStarted] = useState(false);

  const streamSrc = videoStream(src);
  const posterSrc = poster || videoPoster(src, 720);

  /**
   * Controls fade while playing and come back on any interaction — the same
   * grammar as every native player, so nobody has to learn it.
   *
   * Called from event handlers (pointer moves, play, pause) rather than an
   * effect: the timer is a side effect of the interaction, not state React
   * needs to synchronise.
   */
  const wakeChrome = (isPlaying = playing) => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    if (isPlaying) hideTimer.current = setTimeout(() => setChrome(false), 2600);
  };

  // Only the unmount cleanup needs an effect; a stray timer would call
  // setState on a component that is gone.
  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {
        // Autoplay policies can still refuse; leaving the poster up with the
        // big play button is the correct fallback.
        setPlaying(false);
      });
    } else {
      el.pause();
    }
  };

  const seek = (event) => {
    const el = videoRef.current;
    if (!el || !duration) return;
    const next = (Number(event.target.value) / 100) * duration;
    el.currentTime = next;
    setTime(next);
  };

  const progress = duration ? (time / duration) * 100 : 0;

  return (
    <div
      className={`relative w-full overflow-hidden bg-black ${styles.frame}`}
      onPointerMove={wakeChrome}
      onPointerDown={wakeChrome}
    >
      <video
        ref={videoRef}
        className="block h-full w-full object-contain"
        poster={posterSrc || undefined}
        playsInline
        muted={muted}
        preload="metadata"
        onClick={toggle}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          wakeChrome(true);
        }}
        onPause={() => {
          setPlaying(false);
          wakeChrome(false);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => {
          setPlaying(false);
          setChrome(true);
        }}
        aria-label={title}
      >
        <source src={streamSrc} />
      </video>

      {/* The big centre button, before first play and whenever paused. */}
      {(!started || (!playing && !buffering)) && (
        <button
          type="button"
          onClick={toggle}
          className="absolute inset-0 grid place-items-center bg-black/25"
          aria-label="Play"
        >
          <span className={`grid h-16 w-16 place-items-center rounded-full ${styles.bigPlay}`}>
            <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
              <path d="M8 5.2v13.6L19 12z" fill="#fff" />
            </svg>
          </span>
        </button>
      )}

      {buffering && playing && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className={styles.spinner} aria-label="Buffering" />
        </span>
      )}

      {/* Bottom chrome: scrubber, time, mute, fullscreen. */}
      <div
        className={`absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-8 transition-opacity duration-200 ${
          chrome ? "opacity-100" : "pointer-events-none opacity-0"
        } ${styles.chrome}`}
      >
        <input
          type="range"
          min={0}
          max={100}
          step={0.1}
          value={progress}
          onChange={seek}
          aria-label="Seek"
          className={styles.scrub}
          style={{
            background: `linear-gradient(to right, var(--acc) ${progress}%, rgba(255,255,255,.28) ${progress}%)`,
          }}
        />

        <div className="mt-1.5 flex items-center gap-3">
          <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="#fff">
              {playing ? (
                <path d="M7 5h3.4v14H7zm6.6 0H17v14h-3.4z" />
              ) : (
                <path d="M8 5.2v13.6L19 12z" />
              )}
            </svg>
          </button>

          <span className="text-[11.5px] font-medium tabular-nums text-white/90">
            {fmt(time)} / {fmt(duration)}
          </span>

          <button
            type="button"
            className="ml-auto"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (videoRef.current) videoRef.current.muted = next;
            }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="#fff">
              {muted ? (
                <path d="M4 9v6h4l5 4V5L8 9zm12.5 3 2.7-2.7-1.1-1.1L15.4 11l-2.7-2.8-1.1 1.1L14.3 12l-2.7 2.7 1.1 1.1 2.7-2.7 2.7 2.7 1.1-1.1z" />
              ) : (
                <path d="M4 9v6h4l5 4V5L8 9zm11.5 3a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5m-2-7.8v2.1a6 6 0 0 1 0 11.4v2.1a8 8 0 0 0 0-15.6" />
              )}
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              const el = videoRef.current;
              if (!el) return;
              // webkitEnterFullscreen is the iOS Safari path — it fullscreens
              // the VIDEO, since that browser refuses requestFullscreen on a
              // container element.
              if (document.fullscreenElement) document.exitFullscreen?.();
              else if (el.webkitEnterFullscreen) el.webkitEnterFullscreen();
              else el.parentElement?.requestFullscreen?.();
            }}
            aria-label="Fullscreen"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="#fff">
              <path d="M4 9V4h5v2H6v3zm11-5h5v5h-2V6h-3zM6 15v3h3v2H4v-5zm12 0h2v5h-5v-2h3z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
