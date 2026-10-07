import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCoins } from "../../../utils/format.js";
import { easeOutExpo } from "./distributionMath.js";
import { coinSprite, drawSpinningCoin, fitCanvas, prefersReducedMotion } from "./coinSprite.js";
import styles from "./CoinsReceived.module.css";

/**
 * "You've received coins!" — what a hotel manager sees when the month-end
 * payout lands, live or on their next sign-in.
 *
 * Also rendered by the admin's test mode with `preview`, so the client can be
 * shown the hotel's side of the moment without a real hotel being told
 * anything. Nothing in here talks to the API; the caller decides what
 * "Collect" means.
 */

const RAIN_MS = 3200;
const COUNT_MS = 1900;

const rand = (a, b) => a + Math.random() * (b - a);

const CoinsReceived = ({ notice, hotelName, preview = false, position, busy = false, onClose }) => {
  const canvasRef = useRef(null);
  const countRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  const {
    periodLabel,
    coinsCredited = 0,
    coinsRedeemed = 0,
    ratePercent = 0,
    coinInventory = null,
  } = notice || {};

  // Coin rain plus a burst from behind the card, then the counter climbs.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const sprite = coinSprite();
    const reduced = prefersReducedMotion();
    let { w: W, h: H } = fitCanvas(canvas);
    let raf = 0;
    const t0 = performance.now();
    const coins = [];

    const rain = () =>
      coins.push({
        x: rand(0, W),
        y: rand(-60, -20),
        vx: rand(-0.6, 0.6),
        vy: rand(2.4, 5.2),
        g: 0.05,
        r: rand(9, 17),
        a: rand(0, Math.PI * 2),
        va: rand(0.08, 0.2),
      });

    if (!reduced) {
      for (let i = 0; i < 34; i += 1) {
        const ang = rand(-Math.PI * 0.95, -Math.PI * 0.05);
        const v = rand(7, 15);
        coins.push({
          x: W / 2,
          y: H * 0.42,
          vx: Math.cos(ang) * v,
          vy: Math.sin(ang) * v,
          g: 0.32,
          r: rand(10, 18),
          a: rand(0, Math.PI * 2),
          va: rand(0.12, 0.3),
        });
      }
    }

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);

      if (!reduced && t < RAIN_MS && Math.random() < 0.55) rain();

      for (let i = coins.length - 1; i >= 0; i -= 1) {
        const c = coins[i];
        c.vy += c.g;
        c.x += c.vx;
        c.y += c.vy;
        c.a += c.va;
        if (c.y > H + 40) {
          coins.splice(i, 1);
          continue;
        }
        drawSpinningCoin(ctx, sprite, c.x, c.y, c.r, c.a, 0.95);
      }

      if (countRef.current) {
        const p = reduced ? 1 : Math.min(1, Math.max(0, (t - 450) / COUNT_MS));
        countRef.current.textContent = formatCoins(Math.round(coinsCredited * easeOutExpo(p)));
      }
    };

    const onResize = () => ({ w: W, h: H } = fitCanvas(canvas));
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [coinsCredited]);

  const collect = () => {
    if (leaving || busy) return;
    setLeaving(true);
    // Long enough for the exit transition, short enough not to feel slow.
    setTimeout(() => onClose?.(), 320);
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && collect();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return createPortal(
    <div className={`${styles.back} ${leaving ? styles.leaving : ""}`}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

      <div className={styles.card} role="dialog" aria-modal="true" aria-labelledby="coins-received-title">
        <span className={styles.halo} aria-hidden="true" />
        {preview && <span className={styles.previewTag}>Preview · what a hotel sees</span>}

        <div className={styles.coin} aria-hidden="true">
          <span className={styles.face}>B</span>
        </div>

        <span className={styles.kicker}>Month-end payout · {periodLabel}</span>
        <h2 id="coins-received-title" className={styles.title}>
          You&rsquo;ve received coins!
        </h2>

        <div className={styles.amount} aria-label={`${formatCoins(coinsCredited)} coins`}>
          <em>+</em>
          <b ref={countRef}>0</b>
          <small>coins</small>
        </div>

        <p className={styles.body}>
          {ratePercent}% of the {formatCoins(coinsRedeemed)} coins your guests redeemed
          {hotelName ? ` at ${hotelName}` : ""} in {periodLabel} is back in your inventory, ready to
          allocate.
        </p>

        {coinInventory != null && (
          <div className={styles.inventory}>
            <span>Inventory now</span>
            <b>{formatCoins(coinInventory)} coins</b>
          </div>
        )}

        <button type="button" className={styles.collect} onClick={collect} disabled={busy} autoFocus>
          {preview ? "Close preview" : "Collect coins"}
        </button>

        {position && <i className={styles.position}>{position}</i>}
      </div>
    </div>,
    document.body
  );
};

export default CoinsReceived;
