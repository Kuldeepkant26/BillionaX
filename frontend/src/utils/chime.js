/**
 * A short two-note chime, synthesised rather than shipped as a file.
 *
 * Staff at a desk are looking at the guest, not the screen; a sound is what
 * tells them a guest has just opened a payment and the money is about to land.
 * Web Audio keeps it to a few lines with no asset to cache or fail to load.
 *
 * Silent when the browser refuses — autoplay rules block audio until the page
 * has had a click, which a panel in use always has. Never throws.
 */
export const chime = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const now = ctx.currentTime;

    [880, 1320].forEach((freq, i) => {
      const at = now + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;
      // Exponential ramps need a non-zero floor; 0.0001 is inaudible.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);

      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.4);
    });

    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // A missing chime is not worth an error.
  }
};
