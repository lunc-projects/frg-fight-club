import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// FRG Crossing — Frogger-style lane dodging (no frog: you're the runner).
// Every crossing pays exactly 150, so the server re-derives the score
// from the crossing count alone. Traffic speeds up after each crossing.
// 3 lives.
// ---------------------------------------------------------------------------

export const CROSSING_TIERS = [
  { min: 1200, amount: 45 },
  { min: 900, amount: 32 },
  { min: 600, amount: 22 },
  { min: 450, amount: 15 },
  { min: 300, amount: 10 },
  { min: 150, amount: 5 },
];
export function crossingAmount(score) {
  const t = CROSSING_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}
export const CROSSING_POINTS = 150;

const COLS = 10;
const ROWS = 14;
const CELL = 40;
const W = COLS * CELL;
const H = ROWS * CELL;
const SPAWN = { col: 4, row: 13 };
const GOAL_ROW = 0;
const MEDIAN_ROWS = new Set([6, 12]);

// lane definitions: row -> cars {offset(px), width(px), speed(px/s signed), gap(px)}
const LANES = [
  { row: 1, speed: 95, cars: [[0, 62], [210, 62]] },
  { row: 2, speed: -70, cars: [[60, 84], [290, 62]] },
  { row: 3, speed: 120, cars: [[130, 62], [330, 84]] },
  { row: 4, speed: -105, cars: [[20, 62], [190, 62], [350, 62]] },
  { row: 5, speed: 65, cars: [[90, 84], [300, 62]] },
  { row: 7, speed: -125, cars: [[40, 62], [240, 84]] },
  { row: 8, speed: 80, cars: [[150, 62], [330, 62]] },
  { row: 9, speed: -90, cars: [[0, 84], [200, 62]] },
  { row: 10, speed: 140, cars: [[110, 62], [300, 62]] },
  { row: 11, speed: -60, cars: [[70, 62], [230, 62], [370, 84]] },
];
const CAR_COLORS = ['#ef4444', '#3b82f6', '#a855f7', '#f97316', '#eab308', '#ec4899'];

export default function Crossing({ onFinish }) {
  const canvasRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, crossings: 0, lives: 3, msg: 'Swipe, tap the arrows, or use arrow keys to cross!' });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const CAR_IMGS = ['car-red', 'car-blue', 'car-taxi'].map((f) => {
      const im = new Image();
      im.src = `/art/${f}.webp`;
      return im;
    });
    const imgRunner = new Image();
    imgRunner.src = '/art/crossing-runner.webp';
    const startedAt = Date.now();

    const S = {
      player: { ...SPAWN },
      lives: 3,
      crossings: 0,
      score: 0,
      over: false,
      invulnUntil: 0,
      speedScale: 1,
      cars: LANES.map((l, li) => ({
        row: l.row,
        speed: l.speed,
        color: CAR_COLORS[li % CAR_COLORS.length],
        items: l.cars.map(([x, w]) => ({ x, w })),
      })),
      msg: 'Swipe, tap the arrows, or use arrow keys to cross!',
    };

    function syncHud() {
      setHud({ score: S.score, crossings: S.crossings, lives: S.lives, msg: S.msg });
    }
    syncHud();

    function finish() {
      S.over = true;
      const amount = crossingAmount(S.score);
      setTimeout(() => {
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: S.score,
          amount,
          crossings: S.crossings,
          durationMs: Date.now() - startedAt,
        });
      }, 800);
    }

    function resetPlayer() {
      S.player = { ...SPAWN };
      S.invulnUntil = performance.now() + 900;
    }

    function hit() {
      S.lives -= 1;
      if (S.lives <= 0) {
        S.msg = `💥 Caught in traffic — ${S.crossings} crossing${S.crossings === 1 ? '' : 's'}, ${S.score} points.`;
        syncHud();
        finish();
        return;
      }
      S.msg = `💥 Hit! ${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left — back to the curb.`;
      resetPlayer();
      syncHud();
    }

    function crossed() {
      S.crossings += 1;
      S.score = S.crossings * CROSSING_POINTS;
      S.speedScale = Math.min(2.2, 1 + S.crossings * 0.07);
      S.msg = `🏁 Across! +${CROSSING_POINTS} points — traffic speeds up…`;
      resetPlayer();
      syncHud();
    }

    S.move = (dir) => {
      if (S.over) return;
      const p = { ...S.player };
      if (dir === 'up') p.row -= 1;
      if (dir === 'down') p.row += 1;
      if (dir === 'left') p.col -= 1;
      if (dir === 'right') p.col += 1;
      if (p.col < 0 || p.col >= COLS || p.row < 0 || p.row >= ROWS) return;
      S.player = p;
      if (p.row === GOAL_ROW) crossed();
    };

    function collides(now) {
      if (now < S.invulnUntil) return false;
      const px = S.player.col * CELL + 6;
      const pw = CELL - 12;
      for (const lane of S.cars) {
        if (lane.row !== S.player.row) continue;
        for (const c of lane.items) {
          if (px < c.x + c.w - 4 && px + pw > c.x + 4) return true;
        }
      }
      return false;
    }

    function draw(now) {
      // rows
      for (let r = 0; r < ROWS; r++) {
        if (r === GOAL_ROW) ctx.fillStyle = '#a16207';
        else if (r === SPAWN.row || MEDIAN_ROWS.has(r)) ctx.fillStyle = '#14532d';
        else ctx.fillStyle = r % 2 ? '#1f2937' : '#111827';
        ctx.fillRect(0, r * CELL, W, CELL);
        if (r !== GOAL_ROW && !MEDIAN_ROWS.has(r) && r !== SPAWN.row) {
          ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
          ctx.setLineDash([14, 18]);
          ctx.beginPath();
          ctx.moveTo(0, r * CELL + CELL - 1);
          ctx.lineTo(W, r * CELL + CELL - 1);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.fillStyle = '#fef08a';
      ctx.font = '700 17px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('🏁 G O A L 🏁', W / 2, 26);
      // cars — real cartoon sprites (flipped for left-moving lanes),
      // shape-drawn cars until the art loads
      for (const lane of S.cars) {
        lane.items.forEach((c, ci) => {
          const y = lane.row * CELL + 6;
          const dirSign = lane.speed > 0 ? 1 : -1;
          const spr = CAR_IMGS[(lane.row + ci) % CAR_IMGS.length];
          if (spr.complete && spr.naturalWidth) {
            ctx.save();
            if (dirSign < 0) {
              ctx.translate(c.x + c.w / 2, 0);
              ctx.scale(-1, 1);
              ctx.translate(-(c.x + c.w / 2), 0);
            }
            ctx.drawImage(spr, c.x - 5, y - 5, c.w + 10, CELL - 1);
            ctx.restore();
            return;
          }
          ctx.fillStyle = lane.color;
          ctx.beginPath();
          ctx.roundRect(c.x, y, c.w, CELL - 12, 7);
          ctx.fill();
          ctx.fillStyle = 'rgba(191, 219, 254, 0.9)';
          ctx.fillRect(c.x + (dirSign > 0 ? c.w - 24 : 8), y + 5, 15, CELL - 22);
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.arc(c.x + 12, y + CELL - 13, 4.5, 0, 2 * Math.PI);
          ctx.arc(c.x + c.w - 12, y + CELL - 13, 4.5, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
      // player
      const px = S.player.col * CELL + CELL / 2;
      const py = S.player.row * CELL + CELL / 2;
      const blink = now < S.invulnUntil && Math.floor(now / 160) % 2 === 0;
      if (imgRunner.complete && imgRunner.naturalWidth) {
        ctx.save();
        if (blink) ctx.globalAlpha = 0.35;
        const rh = CELL + 15;
        const rw = rh * (imgRunner.naturalWidth / imgRunner.naturalHeight);
        ctx.drawImage(imgRunner, px - rw / 2, py - rh / 2 - 2, rw, rh);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(px, py, 13, 0, 2 * Math.PI);
        ctx.fillStyle = blink ? 'rgba(247, 183, 51, 0.35)' : '#f7b733';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#111827';
        ctx.stroke();
        ctx.fillStyle = '#111827';
        ctx.font = '900 11px system-ui';
        ctx.fillText('FRG', px, py + 4);
      }
    }

    let raf;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(50, now - last);
      last = now;
      if (!S.over) {
        for (const lane of S.cars) {
          for (const c of lane.items) {
            c.x += lane.speed * S.speedScale * (dt / 1000);
            if (lane.speed > 0 && c.x > W + 30) c.x = -c.w - 30;
            if (lane.speed < 0 && c.x + c.w < -30) c.x = W + 30;
          }
        }
        if (collides(now)) hit();
      }
      draw(now);
    };
    raf = requestAnimationFrame(loop);

    const key = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (map[e.key]) {
        e.preventDefault();
        S.move(map[e.key]);
      }
    };
    window.addEventListener('keydown', key);
    let touchStart = null;
    const ts = (e) => {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const te = (e) => {
      if (!touchStart) return;
      const dx = e.changedTouches[0].clientX - touchStart.x;
      const dy = e.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.hypot(dx, dy) < 20) {
        S.move('up');
        return;
      }
      S.move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    canvas.addEventListener('touchstart', ts, { passive: true });
    canvas.addEventListener('touchend', te, { passive: true });

    window.__frgCrossing = {
      state: () => ({
        score: S.score,
        crossings: S.crossings,
        lives: S.lives,
        over: S.over,
        speedScale: Math.round(S.speedScale * 100) / 100,
        player: { ...S.player },
        lanes: S.cars.map((l) => ({
          row: l.row,
          speed: Math.round(l.speed * S.speedScale),
          cars: l.items.map((c) => ({ x: Math.round(c.x), w: c.w })),
        })),
      }),
      move: (dir) => S.move(dir),
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
      canvas.removeEventListener('touchstart', ts);
      canvas.removeEventListener('touchend', te);
      delete window.__frgCrossing;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad = (dir, label) => (
    <button
      className="btn"
      style={{ flex: 1, fontSize: 20, padding: '10px 0' }}
      onPointerDown={(e) => {
        e.preventDefault();
        window.__frgCrossing?.move(dir);
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ maxWidth: 430, margin: '0 auto', padding: 12 }}>
      <h2 className="game-title">🚦 FRG CROSSING</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>SCORE <b>{hud.score}</b></span>
        <span>CROSSED <b>{hud.crossings}</b></span>
        <span>{'❤️'.repeat(Math.max(0, hud.lives))}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: '100%', display: 'block', borderRadius: 12, touchAction: 'none' }}
      />
      <p style={{ textAlign: 'center', minHeight: 22 }}>{hud.msg}</p>
      <div style={{ display: 'flex', gap: 8, maxWidth: 260, margin: '0 auto' }}>
        {pad('left', '◀')}
        {pad('up', '▲')}
        {pad('down', '▼')}
        {pad('right', '▶')}
      </div>
      <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
        Every crossing pays 150 — and speeds the traffic up. Medians are
        safe. Points tiers: 150→5 · 300→10 · 450→15 · 600→22 · 900→32 ·
        1,200→45.
      </p>
    </main>
  );
}
