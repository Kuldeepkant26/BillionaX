import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatCoins, initials } from "../../../utils/format.js";
import { bezier, easeInOutCubic, particlePlan, splitCoins } from "./distributionMath.js";
import {
  coinSprite,
  drawSpinningCoin,
  fitCanvas,
  glowSprite,
  prefersReducedMotion,
} from "./coinSprite.js";
import styles from "./DistributionShow.module.css";

/**
 * The month-end coin distribution, as a show.
 *
 * Three acts: the vault CHARGES, coins fly in arcs to every hotel while their
 * counters tick up (DISTRIBUTING), and the finale confirms it (COMPLETE).
 *
 * In a live run the vault charges while the server is actually crediting the
 * hotels, and the flight only starts once the real results are back — so what
 * the admin watches land is what was paid, never a guess. `rows` stays null
 * until then; `previewRows` lays the cards out in the meantime.
 *
 * Everything that moves at 60fps lives outside React: one requestAnimationFrame
 * loop draws the canvas and writes the counters straight into DOM nodes held
 * in refs. React re-renders only on the three phase changes.
 */

const MIN_CHARGE_MS = 2300;
const FLIGHT_MS = [820, 1240];
const EMIT_WINDOW_MS = 950;

const GOLD = "rgba(255, 214, 92, 1)";
const WHITE = "rgba(255, 250, 235, 1)";
const MINT = "rgba(120, 236, 178, 1)";
const CONFETTI = ["#ffd65c", "#fff1c1", "#f59e0b", "#7cf0b5", "#8fa4ff", "#ff8fb1", "#ffffff"];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const center = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const DistributionShow = ({
  mode = "live",
  periodLabel,
  ratePercent,
  rows,
  previewRows,
  error,
  sample = false,
  onClose,
  onReplay,
  onPreviewHotel,
}) => {
  const cards = useMemo(() => rows || previewRows || [], [rows, previewRows]);
  const total = useMemo(() => cards.reduce((s, r) => s + r.coins, 0), [cards]);
  const ready = Boolean(rows);

  const [phase, setPhase] = useState("charging");
  const shown = error ? "error" : phase;
  // "test" plays a forecast; "replay" re-plays a month that really was paid.
  // Neither writes anything, so both may be closed at any moment.
  const isTest = mode !== "live";
  const simulated = mode === "test";

  const canvasRef = useRef(null);
  const vaultRef = useRef(null);
  const vaultCountRef = useRef(null);
  const gridRef = useRef(null);
  const cardEls = useRef(new Map());
  const engine = useRef(null);
  const doneBtnRef = useRef(null);

  // The loop reads these each frame rather than closing over render values.
  const rowsRef = useRef(rows);
  const errorRef = useRef(error);
  useEffect(() => {
    rowsRef.current = rows;
    errorRef.current = error;
    engine.current?.measure();
  }, [rows, error]);

  /* ---- the engine ------------------------------------------------------ */

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const reduced = prefersReducedMotion();
    const coin = coinSprite();
    const glowGold = glowSprite("rgba(255, 214, 92, 1)");
    const glowWhite = glowSprite("rgba(255, 250, 235, 1)");
    const glowMint = glowSprite("rgba(120, 236, 178, 1)");
    const glowFor = { [GOLD]: glowGold, [WHITE]: glowWhite, [MINT]: glowMint };

    let W = 0;
    let H = 0;
    let raf = 0;
    let local = "charging";
    const t0 = performance.now();
    let doneAt = 0;

    const stars = Array.from({ length: 120 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: rand(0.4, 1.4),
      tw: rand(0, Math.PI * 2),
      sp: rand(0.6, 2.2),
    }));
    const motes = [];
    const flights = [];
    const queue = [];
    const sparks = [];
    const confetti = [];

    const received = new Map();
    let grand = 0;
    let sent = 0;

    const targets = new Map();
    let vault = { x: 0, y: 0 };
    let vaultR = 80;

    const measure = () => {
      if (vaultRef.current) {
        vault = center(vaultRef.current);
        vaultR = vaultRef.current.getBoundingClientRect().width / 2;
      }
      targets.clear();
      for (const [id, card] of cardEls.current) {
        const c = center(card.el);
        // Aim at the counter, not the card's middle — that is where the coins
        // "go", and it sits higher than centre on a two-line card.
        targets.set(id, { x: c.x, y: c.y + 4 });
      }
    };

    const resize = () => {
      ({ w: W, h: H } = fitCanvas(canvas));
      measure();
    };

    const burst = (x, y, count, palette = [GOLD, WHITE], speed = 3.2) => {
      for (let i = 0; i < count; i += 1) {
        const a = rand(0, Math.PI * 2);
        const v = rand(speed * 0.35, speed);
        sparks.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 0.6,
          life: 1,
          decay: rand(0.022, 0.045),
          size: rand(5, 11),
          color: palette[i % palette.length],
        });
      }
    };

    const cannon = () => {
      // A curtain from the top plus two cannons from the lower corners.
      for (let i = 0; i < 110; i += 1) {
        confetti.push({
          x: rand(0, W),
          y: rand(-H * 0.4, -10),
          vx: rand(-1.2, 1.2),
          vy: rand(1.5, 4),
          rot: rand(0, Math.PI),
          vr: rand(-0.2, 0.2),
          w: rand(6, 11),
          h: rand(3, 6),
          color: CONFETTI[i % CONFETTI.length],
          sway: rand(0, Math.PI * 2),
        });
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 60; i += 1) {
          confetti.push({
            x: side < 0 ? 0 : W,
            y: H * 0.92,
            vx: -side * rand(4, 13),
            vy: rand(-19, -9),
            rot: rand(0, Math.PI),
            vr: rand(-0.3, 0.3),
            w: rand(6, 11),
            h: rand(3, 6),
            color: CONFETTI[(i + 3) % CONFETTI.length],
            sway: rand(0, Math.PI * 2),
          });
        }
      }
    };

    const writeCard = (id, got, total) => {
      const card = cardEls.current.get(id);
      if (!card) return null;
      card.count.textContent = formatCoins(got);
      card.bar.style.transform = `scaleX(${clamp(total ? got / total : 1, 0, 1)})`;
      return card;
    };

    const land = (job, now) => {
      const got = (received.get(job.id) || 0) + job.value;
      received.set(job.id, got);
      sent += job.value;
      if (vaultCountRef.current) {
        vaultCountRef.current.textContent = formatCoins(Math.max(0, grand - sent));
      }

      const card = writeCard(job.id, got, job.total);
      const at = targets.get(job.id);
      if (at && !reduced) burst(at.x, at.y, 6);

      if (card && now - (card.bumped || 0) > 110) {
        card.bumped = now;
        card.el.animate(
          [{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }],
          { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
      }

      if (card && got >= job.total && !card.el.classList.contains(styles.done)) {
        card.el.classList.add(styles.done);
        if (at && !reduced) burst(at.x, at.y, 28, [MINT, WHITE, GOLD], 5.5);
      }
    };

    const begin = (now) => {
      local = "distributing";
      setPhase("distributing");
      measure();

      const list = (rowsRef.current || []).filter((r) => r.coins > 0);
      grand = list.reduce((s, r) => s + r.coins, 0);
      sent = 0;
      if (vaultCountRef.current) vaultCountRef.current.textContent = formatCoins(grand);

      if (reduced) {
        list.forEach((r, i) =>
          queue.push({ id: r.hotelId, value: r.coins, total: r.coins, at: now + 200 + i * 140, instant: true })
        );
      } else {
        const plan = particlePlan(list.map((r) => r.coins));
        const stagger = clamp(2600 / Math.max(1, list.length), 110, 480);
        list.forEach((r, i) => {
          const n = Math.max(1, Math.min(plan[i], r.coins));
          splitCoins(r.coins, n).forEach((value, k) =>
            queue.push({
              id: r.hotelId,
              value,
              total: r.coins,
              at: now + 300 + i * stagger + (k / n) * EMIT_WINDOW_MS + rand(0, 70),
            })
          );
        });
      }
      queue.sort((a, b) => a.at - b.at);
    };

    const finish = (now) => {
      local = "complete";
      setPhase("complete");
      if (vaultCountRef.current) vaultCountRef.current.textContent = formatCoins(grand);
      if (!reduced) {
        cannon();
        burst(vault.x, vault.y, 60, [GOLD, WHITE, MINT], 9);
      }
      doneAt = now;
    };

    const skip = () => {
      const now = performance.now();
      if (local === "charging") {
        if (!rowsRef.current) return;
        begin(now);
      }
      if (local !== "distributing") return;
      queue.length = 0;
      flights.length = 0;
      for (const r of (rowsRef.current || []).filter((x) => x.coins > 0)) {
        received.set(r.hotelId, r.coins);
        const card = writeCard(r.hotelId, r.coins, r.coins);
        card?.el.classList.add(styles.done);
      }
      sent = grand;
      finish(now);
    };

    engine.current = { measure, skip };

    const spawn = (job, now) => {
      const tg = targets.get(job.id);
      if (job.instant || !tg) {
        land(job, now);
        return;
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      // Launch from the rim, on the side facing the hotel — launching from
      // the centre buried the "Remaining" counter under a pile of coins.
      const dx0 = tg.x - vault.x;
      const dy0 = tg.y - vault.y;
      const d0 = Math.hypot(dx0, dy0) || 1;
      const rim = vaultR * rand(0.7, 0.86);
      const spread = rand(-0.35, 0.35);
      const ux = dx0 / d0;
      const uy = dy0 / d0;
      flights.push({
        ...job,
        from: {
          x: vault.x + (ux * Math.cos(spread) - uy * Math.sin(spread)) * rim,
          y: vault.y + (ux * Math.sin(spread) + uy * Math.cos(spread)) * rim,
        },
        bend: rand(0.16, 0.42) * side,
        lift: rand(0.12, 0.3),
        born: now,
        dur: rand(FLIGHT_MS[0], FLIGHT_MS[1]),
        size: rand(8.5, 13.5),
        spin: rand(0, Math.PI * 2),
        spinV: rand(7, 13) * side,
        trail: [],
      });
    };

    /* ---- the frame ---- */

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);

      // Starfield.
      ctx.globalCompositeOperation = "lighter";
      for (const s of stars) {
        const a = 0.25 + 0.35 * Math.sin(t * s.sp + s.tw);
        ctx.globalAlpha = a;
        ctx.fillStyle = "#fff8e6";
        ctx.fillRect(s.x * W, s.y * H, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      // Act one: energy spirals into the vault while the server works.
      if (local === "charging") {
        if (errorRef.current) {
          local = "error";
        } else {
          const charge = Math.min(1, (now - t0) / MIN_CHARGE_MS);
          if (!reduced) {
            for (let i = 0; i < 2 + Math.round(charge * 3); i += 1) {
              motes.push({
                a: rand(0, Math.PI * 2),
                r: rand(150, Math.max(W, H) * 0.55),
                va: rand(0.025, 0.06) * (Math.random() < 0.5 ? -1 : 1),
                life: 0,
                size: rand(5, 12),
                gold: Math.random() < 0.7,
              });
            }
          }
          if (rowsRef.current && now - t0 >= (reduced ? 500 : MIN_CHARGE_MS)) begin(now);
        }
      }

      for (let i = motes.length - 1; i >= 0; i -= 1) {
        const m = motes[i];
        m.r *= 0.955;
        m.a += m.va * (1 + (220 / (m.r + 20)));
        m.life = Math.min(1, m.life + 0.06);
        if (m.r < 16) {
          motes.splice(i, 1);
          continue;
        }
        const x = vault.x + Math.cos(m.a) * m.r;
        const y = vault.y + Math.sin(m.a) * m.r;
        ctx.globalAlpha = m.life * clamp(m.r / 120, 0.2, 0.9);
        ctx.drawImage(m.gold ? glowGold : glowWhite, x - m.size / 2, y - m.size / 2, m.size, m.size);
      }
      ctx.globalAlpha = 1;

      // Act two: launch whatever is due, fly whatever is airborne.
      if (local === "distributing") {
        while (queue.length && queue[0].at <= now) spawn(queue.shift(), now);
      }

      for (let i = flights.length - 1; i >= 0; i -= 1) {
        const f = flights[i];
        const tg = targets.get(f.id) || f.from;
        const p = clamp((now - f.born) / f.dur, 0, 1);
        const e = easeInOutCubic(p);
        const dx = tg.x - f.from.x;
        const dy = tg.y - f.from.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ctrl = {
          x: (f.from.x + tg.x) / 2 + (-dy / dist) * dist * f.bend,
          y: (f.from.y + tg.y) / 2 + (dx / dist) * dist * f.bend - dist * f.lift,
        };
        const pos = bezier(f.from, ctrl, tg, e);

        f.trail.push(pos);
        if (f.trail.length > 8) f.trail.shift();
        for (let k = 0; k < f.trail.length; k += 1) {
          const q = f.trail[k];
          const s = f.size * (0.6 + k / 10);
          ctx.globalAlpha = (k / f.trail.length) * 0.38;
          ctx.drawImage(glowGold, q.x - s, q.y - s, s * 2, s * 2);
        }
        ctx.globalAlpha = 1;

        if (p >= 1) {
          flights.splice(i, 1);
          land(f, now);
          continue;
        }

        ctx.globalCompositeOperation = "source-over";
        const scale = 0.75 + 0.55 * Math.sin(Math.PI * p);
        drawSpinningCoin(ctx, coin, pos.x, pos.y, f.size * scale, f.spin + f.spinV * p);
        ctx.globalCompositeOperation = "lighter";
      }

      if (local === "distributing" && !queue.length && !flights.length) {
        if (!doneAt) doneAt = now + 420;
        if (now >= doneAt) finish(now);
      }

      // Sparks.
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.06;
        s.vx *= 0.97;
        s.life -= s.decay;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        const size = s.size * s.life;
        ctx.globalAlpha = s.life;
        ctx.drawImage(glowFor[s.color] || glowGold, s.x - size / 2, s.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      // Act three: confetti.
      ctx.globalCompositeOperation = "source-over";
      for (let i = confetti.length - 1; i >= 0; i -= 1) {
        const c = confetti[i];
        c.vy += 0.24;
        c.vx *= 0.985;
        c.vy *= 0.985;
        c.sway += 0.08;
        c.x += c.vx + Math.sin(c.sway) * 0.6;
        c.y += c.vy;
        c.rot += c.vr;
        if (c.y > H + 30) {
          confetti.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.scale(1, Math.cos(c.sway * 1.6));
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize);
    const grid = gridRef.current;
    grid?.addEventListener("scroll", measure, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      grid?.removeEventListener("scroll", measure);
      engine.current = null;
    };
  }, []);

  // The cards mount in a staggered entrance; re-aim once they have settled.
  useEffect(() => {
    const id = setTimeout(() => engine.current?.measure(), 650);
    return () => clearTimeout(id);
  }, [cards.length]);

  /* ---- page chrome ---------------------------------------------------- */

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const canClose = isTest || shown === "complete" || shown === "error";
  const canSkip = ready && (shown === "charging" || shown === "distributing");

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && canClose && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canClose, onClose]);

  useEffect(() => {
    if (shown === "complete") doneBtnRef.current?.focus();
  }, [shown]);

  const hotels = cards.length;
  const caption =
    shown === "charging"
      ? ready
        ? `Preparing ${hotels} payout${hotels === 1 ? "" : "s"}`
        : isTest
          ? "Preparing the payout"
          : "Crediting hotel inventories"
      : shown === "distributing"
        ? `Delivering coins to ${hotels} hotel${hotels === 1 ? "" : "s"}`
        : "";

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`Coin distribution for ${periodLabel}`}
    >
      <div className={styles.aurora} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={styles.dots} aria-hidden="true" />
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

      <header className={styles.top}>
        <span className={styles.brand}>
          <b>Coin distribution</b>
          <i>{periodLabel}</i>
        </span>
        {isTest && (
          <span className={styles.testPill}>
            <i />
            {mode === "replay"
              ? "Replay · no coins move"
              : sample
                ? "Test mode · sample hotels"
                : "Test mode · nothing is credited"}
          </span>
        )}
        <span className="flex-1" />
        {canSkip && (
          <button type="button" className={styles.ghostBtn} onClick={() => engine.current?.skip()}>
            Skip animation
          </button>
        )}
        {canClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        )}
      </header>

      <section className={styles.stage}>
        <div ref={vaultRef} className={`${styles.vault} ${styles[shown] || ""}`}>
          <i className={styles.r1} />
          <i className={styles.r2} />
          <i className={styles.r3} />
          <span className={styles.core}>
            {shown === "complete" ? (
              <>
                <span className={styles.tick} aria-hidden="true">
                  ✓
                </span>
                <small>All sent</small>
              </>
            ) : (
              <>
                <small>{shown === "distributing" ? "Remaining" : "To distribute"}</small>
                <b ref={vaultCountRef}>{ready || isTest ? formatCoins(total) : "· · ·"}</b>
                <small>coins</small>
              </>
            )}
          </span>
          <i className={styles.shock} />
          <i className={`${styles.shock} ${styles.shock2}`} />
        </div>

        {caption && (
          <p className={styles.caption} aria-live="polite">
            {caption}
            <span className={styles.ellipsis} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </p>
        )}

        {shown === "complete" && (
          <div className={styles.finale}>
            <span className={styles.kicker}>
              {simulated ? "Test run finished — no coins moved" : `${periodLabel} · ${ratePercent}% payout`}
            </span>
            <h2>Coin distribution complete</h2>
            <p>
              {hotels
                ? `${formatCoins(total)} coins ${simulated ? "would go" : "went"} to ${hotels} hotel${
                    hotels === 1 ? "" : "s"
                  } — ${ratePercent}% of what their guests redeemed.`
                : "No hotel had coins to receive this month."}
              {!simulated && hotels > 0 && " Every hotel has been notified."}
            </p>
            <div className={styles.actions}>
              {onPreviewHotel && hotels > 0 && (
                <button type="button" className={styles.ghostBtn} onClick={() => onPreviewHotel(cards[0])}>
                  See what hotels see
                </button>
              )}
              {onReplay && (
                <button type="button" className={styles.ghostBtn} onClick={onReplay}>
                  Replay
                </button>
              )}
              <button type="button" ref={doneBtnRef} className={styles.goldBtn} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}

        {shown === "error" && (
          <div className={styles.failure} role="alert">
            <h2>The distribution did not finish</h2>
            <p>{error}</p>
            <p className={styles.reassure}>
              No hotel can be paid twice — anyone already credited is skipped, so it is safe to try
              again.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.goldBtn} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </section>

      <div className={styles.gridWrap} ref={gridRef}>
        <div className={styles.grid}>
          {cards.map((r, i) => (
            <article
              key={r.hotelId}
              className={styles.hotel}
              style={{ "--i": Math.min(i, 24) }}
              ref={(el) => {
                if (el) {
                  cardEls.current.set(r.hotelId, {
                    el,
                    count: el.querySelector("[data-count]"),
                    bar: el.querySelector("[data-bar]"),
                  });
                } else {
                  cardEls.current.delete(r.hotelId);
                }
              }}
            >
              <span className={styles.logo}>
                {r.logoUrl ? <img src={r.logoUrl} alt="" /> : initials(r.name)}
              </span>
              <span className={styles.meta}>
                <b title={r.name}>{r.name}</b>
                <i>{r.city || " "}</i>
              </span>
              <span className={styles.amount}>
                <em>+</em>
                <strong data-count>0</strong>
                <small>/ {formatCoins(r.coins)}</small>
              </span>
              <span className={styles.bar}>
                <i data-bar />
              </span>
              <span className={styles.check} aria-hidden="true">
                ✓
              </span>
            </article>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DistributionShow;
