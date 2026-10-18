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
    const imgBg = new Image();
    imgBg.src = '/art/snake-bg.webp';
    const imgOrb = new Image();
    imgOrb.src = '/art/orb-green.webp';
    const imgOrbGold = new Image();
    imgOrbGold.src = '/art/orb-gold.webp';
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
      if (imgBg.complete && imgBg.naturalWidth) {
        const sc = Math.max(W / imgBg.naturalWidth, H / imgBg.naturalHeight);
        const bw = imgBg.naturalWidth * sc;
        const bh = imgBg.naturalHeight * sc;
        ctx.drawImage(imgBg, (W - bw) / 2, (H - bh) / 2, bw, bh);
        ctx.fillStyle = 'rgba(2, 20, 10, 0.45)';
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = '#052e16';
        ctx.fillRect(0, 0, W, H);
      }
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
      // orb — glowing sprite with a soft halo, plain circle until it loads
      if (S.orb) {
        const hx = S.orb.x * CELL + CELL / 2;
        const hy = S.orb.y * CELL + CELL / 2;
        const halo = ctx.createRadialGradient(hx, hy, 1, hx, hy, 17);
        halo.addColorStop(0, S.orb.golden ? 'rgba(250, 204, 21, 0.40)' : 'rgba(74, 222, 128, 0.34)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(hx, hy, 17, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (S.orb) {
        const ocx = S.orb.x * CELL + CELL / 2;
        const ocy = S.orb.y * CELL + CELL / 2;
        const oimg = S.orb.golden ? imgOrbGold : imgOrb;
        if (oimg.complete && oimg.naturalWidth) {
          const osz = S.orb.golden ? 21 : 18;
          ctx.drawImage(oimg, ocx - osz / 2, ocy - osz / 2, osz, osz);
        } else {
          ctx.beginPath();
          ctx.arc(ocx, ocy, S.orb.golden ? 8 : 6.5, 0, 2 * Math.PI);
          ctx.fillStyle = S.orb.golden ? '#facc15' : '#4ade80';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.stroke();
        }
      }
      // snake — glossy 2026 body: soft shadow, radial-gradient segments
      // that overlap into one shiny worm, glass gloss on every segment.
      {
        const pts = S.snake.map((sg) => ({ x: sg.x * CELL + CELL / 2, y: sg.y * CELL + CELL / 2 }));
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y + 2.5, CELL * 0.46, 0, 2 * Math.PI);
          ctx.fill();
        }
        for (let i = pts.length - 1; i >= 1; i--) {
          const p = pts[i];
          const t = Math.min(1, i / 16);
          const g = ctx.createRadialGradient(p.x - 4, p.y - 5, 1.5, p.x, p.y, CELL * 0.55);
          g.addColorStop(0, `hsl(140 74% ${68 - t * 18}%)`);
          g.addColorStop(0.55, `hsl(142 62% ${49 - t * 12}%)`);
          g.addColorStop(1, `hsl(146 60% ${29 - t * 6}%)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, CELL * 0.465, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.20)';
          ctx.beginPath();
          ctx.ellipse(p.x - 3.5, p.y - 5, 4.6, 2.6, -0.5, 0, 2 * Math.PI);
          ctx.fill();
        }
        const hp = pts[0];
        if (hp) {
          const g = ctx.createRadialGradient(hp.x - 4, hp.y - 5, 2, hp.x, hp.y, CELL * 0.6);
          g.addColorStop(0, '#ffeda6');
          g.addColorStop(0.5, '#f7b733');
          g.addColorStop(1, '#c47f0a');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, CELL * 0.52, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath();
          ctx.ellipse(hp.x - 4, hp.y - 5.5, 5, 2.8, -0.5, 0, 2 * Math.PI);
          ctx.fill();
          for (const ex of [-3.6, 3.6]) {
            ctx.fillStyle = '#111827';
            ctx.beginPath();
            ctx.arc(hp.x + ex, hp.y - 1.5, 1.9, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(hp.x + ex + 0.6, hp.y - 2.1, 0.7, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
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
      <p className="fineprint">
        Orbs 25 · every 5th is golden, 60. Tiers: 150→5 · 300→10 · 500→15 ·
        750→22 · 1,050→32 · 1,400→45.
      </p>
    </main>
  );
}
