import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// FRG Snake — the classic. Orbs pay 25, every 5th orb is golden and pays
// 60. The server re-derives the score EXACTLY from the orb counts
// (golden must equal floor(total/5)) — tiers below convert to points.
// ---------------------------------------------------------------------------

export const SNAKE_TIERS = [
  { min: 1400, amount: 45 },
  { min: 1050, amount: 32 },
  { min: 750, amount: 22 },
  { min: 500, amount: 15 },
  { min: 300, amount: 10 },
  { min: 150, amount: 5 },
];
export function snakeAmount(score) {
  const t = SNAKE_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const COLS = 20;
const ROWS = 26;
const CELL = 20;
const W = COLS * CELL;
const H = ROWS * CELL;

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export default function Snake({ onFinish }) {
  const canvasRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, len: 4, msg: 'Swipe, tap the arrows, or use arrow keys. First move starts!' });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const startedAt = Date.now();

    const S = {
      snake: [
        { x: 7, y: 13 },
        { x: 6, y: 13 },
        { x: 5, y: 13 },
        { x: 4, y: 13 },
      ],
      dir: DIRS.right,
      queued: [],
      orb: null,
      spawnCount: 0,
      orbs: 0,
      golden: 0,
      score: 0,
      started: false,
      over: false,
      acc: 0,
      msg: 'Swipe, tap the arrows, or use arrow keys. First move starts!',
    };

    function syncHud() {
      setHud({ score: S.score, len: S.snake.length, msg: S.msg });
    }
    function spawnOrb() {
      const taken = new Set(S.snake.map((s) => `${s.x},${s.y}`));
      let cell;
      do {
        cell = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      } while (taken.has(`${cell.x},${cell.y}`));
      S.spawnCount += 1;
      S.orb = { ...cell, golden: S.spawnCount % 5 === 0 };
    }
    spawnOrb();
    syncHud();

    S.turn = (name) => {
      const d = DIRS[name];
      if (!d) return;
      if (!S.started) {
        S.started = true;
        S.msg = '';
      }
      const last = S.queued.length ? S.queued[S.queued.length - 1] : S.dir;
      if (d.x === -last.x && d.y === -last.y) return; // no 180s
      if (S.queued.length < 3) S.queued.push(d);
    };

    function die() {
      S.over = true;
      const amount = snakeAmount(S.score);
      S.msg = `🐍 Game over — ${S.score} points (${S.orbs + S.golden} orbs).`;
      syncHud();
      setTimeout(() => {
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: S.score,
          amount,
          orbs: S.orbs + S.golden,
          golden: S.golden,
          durationMs: Date.now() - startedAt,
        });
      }, 800);
    }

    function tick() {
      if (S.queued.length) S.dir = S.queued.shift();
      const head = { x: S.snake[0].x + S.dir.x, y: S.snake[0].y + S.dir.y };
      if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return die();
      const eats = S.orb && head.x === S.orb.x && head.y === S.orb.y;
      const bodyToCheck = eats ? S.snake : S.snake.slice(0, -1);
      if (bodyToCheck.some((s) => s.x === head.x && s.y === head.y)) return die();
      S.snake.unshift(head);
      if (eats) {
        if (S.orb.golden) {
          S.golden += 1;
          S.score += 60;
        } else {
          S.orbs += 1;
          S.score += 25;
        }
        spawnOrb();
        syncHud();
      } else {
        S.snake.pop();
      }
    }

    function draw() {
      ctx.fillStyle = '#052e16';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1;
      for (let x = 1; x < COLS; x++) {
        ctx.beginPath();
        ctx.moveTo(x * CELL, 0);
        ctx.lineTo(x * CELL, H);
        ctx.stroke();
      }
      for (let y = 1; y < ROWS; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * CELL);
        ctx.lineTo(W, y * CELL);
        ctx.stroke();
      }
      // orb
      if (S.orb) {
        ctx.beginPath();
        ctx.arc(S.orb.x * CELL + CELL / 2, S.orb.y * CELL + CELL / 2, S.orb.golden ? 8 : 6.5, 0, 2 * Math.PI);
        ctx.fillStyle = S.orb.golden ? '#facc15' : '#4ade80';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.stroke();
      }
      // snake
      S.snake.forEach((s, i) => {
        const pad = i === 0 ? 1 : 2;
        ctx.fillStyle = i === 0 ? '#f7b733' : `hsl(140 60% ${52 - Math.min(22, i * 0.7)}%)`;
        ctx.beginPath();
        ctx.roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, 5);
        ctx.fill();
        if (i === 0) {
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.arc(s.x * CELL + 7, s.y * CELL + 8, 1.8, 0, 2 * Math.PI);
          ctx.arc(s.x * CELL + 13, s.y * CELL + 8, 1.8, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
      if (!S.started && !S.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 22px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('TAP AN ARROW TO START', W / 2, H / 2);
      }
      if (S.over) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 26px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', W / 2, H / 2);
      }
    }

    let raf;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = now - last;
      last = now;
      if (S.started && !S.over) {
        S.acc += dt;
        const speed = Math.min(14, 7 + (S.orbs + S.golden) * 0.18); // ticks per second
        const stepMs = 1000 / speed;
        while (S.acc >= stepMs && !S.over) {
          S.acc -= stepMs;
          tick();
        }
      }
      draw();
    };
    raf = requestAnimationFrame(loop);

    // controls: keys + swipe
    const key = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (map[e.key]) {
        e.preventDefault();
        S.turn(map[e.key]);
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
      if (Math.hypot(dx, dy) < 24) return;
      S.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    canvas.addEventListener('touchstart', ts, { passive: true });
    canvas.addEventListener('touchend', te, { passive: true });

    window.__frgSnake = {
      state: () => ({
        score: S.score,
        orbs: S.orbs + S.golden,
        golden: S.golden,
        len: S.snake.length,
        started: S.started,
        over: S.over,
        head: { ...S.snake[0] },
        orb: S.orb ? { x: S.orb.x, y: S.orb.y, golden: S.orb.golden } : null,
        body: S.snake.map((s) => ({ ...s })),
        dir: Object.keys(DIRS).find((k) => DIRS[k] === S.dir),
      }),
      turn: (name) => S.turn(name),
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', key);
      canvas.removeEventListener('touchstart', ts);
      canvas.removeEventListener('touchend', te);
      delete window.__frgSnake;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pad = (dir, label) => (
    <button
      className="btn"
      style={{ flex: 1, fontSize: 20, padding: '10px 0' }}
      onPointerDown={(e) => {
        e.preventDefault();
        window.__frgSnake?.turn(dir);
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ maxWidth: 430, margin: '0 auto', padding: 12 }}>
      <h2 className="game-title">🐍 FRG SNAKE</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>SCORE <b>{hud.score}</b></span>
        <span>LENGTH <b>{hud.len}</b></span>
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
        Orbs pay 25 · every 5th orb is golden and pays 60. The snake speeds
        up as it eats. Points tiers: 150→5 · 300→10 · 500→15 · 750→22 ·
        1,050→32 · 1,400→45.
      </p>
    </main>
  );
}
