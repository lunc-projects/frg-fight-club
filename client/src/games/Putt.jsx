import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// FRG Mini Putt — 3 holes, drag-back slingshot putting.
// Scoring: a hole pays (7 - strokes) * 40 points (ace = 240); a hole
// picked up after 7 strokes pays 0. The server re-derives the total
// EXACTLY from the per-hole stroke counts. Tiers below convert the
// total to leaderboard points.
// ---------------------------------------------------------------------------

export const PUTT_TIERS = [
  { min: 680, amount: 45 },
  { min: 560, amount: 32 },
  { min: 440, amount: 22 },
  { min: 320, amount: 15 },
  { min: 220, amount: 10 },
  { min: 120, amount: 5 },
];
export function puttAmount(score) {
  const t = PUTT_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}
export function puttHoleScore(strokes) {
  return strokes >= 7 ? 0 : (7 - strokes) * 40;
}

const W = 400;
const H = 560;
const BALL_R = 8;
const CUP_R = 11;

const HOLES = [
  {
    name: 'Straight Shot',
    par: 2,
    ball: { x: 200, y: 495 },
    cup: { x: 200, y: 78 },
    walls: [
      { x: 55, y: 285, w: 112, h: 14 },
      { x: 233, y: 285, w: 112, h: 14 },
    ],
  },
  {
    name: 'The Bank',
    par: 3,
    ball: { x: 78, y: 500 },
    cup: { x: 322, y: 88 },
    walls: [
      { x: 193, y: 205, w: 14, h: 175 },
      { x: 55, y: 335, w: 132, h: 14 },
    ],
  },
  {
    name: 'Slalom',
    par: 3,
    ball: { x: 200, y: 505 },
    cup: { x: 200, y: 72 },
    walls: [
      { x: 38, y: 382, w: 152, h: 14 },
      { x: 210, y: 248, w: 152, h: 14 },
    ],
  },
];

export default function Putt({ onFinish }) {
  const canvasRef = useRef(null);
  const G = useRef(null);
  const [hud, setHud] = useState({ hole: 1, strokes: 0, score: 0, msg: 'Drag back from the ball and release to putt!' });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imgBg = new Image();
    imgBg.src = '/art/putt-bg.webp';
    const startedAt = Date.now();

    const S = {
      holeIdx: 0,
      strokes: 0,
      strokesPerHole: [],
      score: 0,
      ball: { x: 0, y: 0, vx: 0, vy: 0 },
      aiming: null, // {dx, dy} drag vector
      over: false,
      trail: [],
      particles: [],
      popups: [],
      msg: 'Drag back from the ball and release to putt!',
    };
    G.current = S;

    const hole = () => HOLES[S.holeIdx];
    const moving = () => Math.hypot(S.ball.vx, S.ball.vy) > 0;

    function syncHud() {
      setHud({ hole: S.holeIdx + 1, strokes: S.strokes, score: S.score, msg: S.msg });
    }
    function placeBall() {
      S.ball.x = hole().ball.x;
      S.ball.y = hole().ball.y;
      S.ball.vx = 0;
      S.ball.vy = 0;
      S.strokes = 0;
      S.trail = [];
    }
    placeBall();
    syncHud();

    function finishHole() {
      const hs = puttHoleScore(S.strokes);
      S.score += hs;
      S.strokesPerHole.push(S.strokes);
      if (S.holeIdx >= HOLES.length - 1) {
        S.over = true;
        const amount = puttAmount(S.score);
        S.msg = `⛳ Round complete — ${S.score} points!`;
        syncHud();
        setTimeout(() => {
          onFinish({
            outcome: amount > 0 ? 'win' : 'lose',
            score: S.score,
            amount,
            strokesPerHole: S.strokesPerHole,
            durationMs: Date.now() - startedAt,
          });
        }, 900);
        return;
      }
      S.holeIdx += 1;
      placeBall();
      S.msg = `Hole ${S.holeIdx + 1}: ${hole().name} (par ${hole().par}).`;
      syncHud();
    }

    S.shoot = (angleDeg, power) => {
      if (S.over || moving()) return false;
      const a = (angleDeg * Math.PI) / 180;
      const v = 3.2 + Math.max(0, Math.min(1, power)) * 12.5;
      S.ball.vx = Math.cos(a) * v;
      S.ball.vy = Math.sin(a) * v;
      S.strokes += 1;
      S.msg = '';
      syncHud();
      return true;
    };

    function step() {
      const b = S.ball;
      if (moving()) {
        S.trail.push({ x: b.x, y: b.y });
        if (S.trail.length > 13) S.trail.shift();
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= 0.988;
        b.vy *= 0.988;
        if (Math.hypot(b.vx, b.vy) < 0.09) {
          b.vx = 0;
          b.vy = 0;
          if (!S.over) {
            if (S.strokes >= 7) {
              S.msg = 'Seven strokes — picking up. Next hole!';
              syncHud();
              setTimeout(finishHole, 650);
            } else {
              S.msg = 'Your putt — drag back and release.';
              syncHud();
            }
          }
        }
        // outer walls
        if (b.x < BALL_R + 6) { b.x = BALL_R + 6; b.vx = Math.abs(b.vx) * 0.78; }
        if (b.x > W - BALL_R - 6) { b.x = W - BALL_R - 6; b.vx = -Math.abs(b.vx) * 0.78; }
        if (b.y < BALL_R + 6) { b.y = BALL_R + 6; b.vy = Math.abs(b.vy) * 0.78; }
        if (b.y > H - BALL_R - 6) { b.y = H - BALL_R - 6; b.vy = -Math.abs(b.vy) * 0.78; }
        // inner walls (circle vs AABB, push out along smallest penetration)
        for (const wl of hole().walls) {
          const nx = Math.max(wl.x, Math.min(b.x, wl.x + wl.w));
          const ny = Math.max(wl.y, Math.min(b.y, wl.y + wl.h));
          const dx = b.x - nx;
          const dy = b.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 < BALL_R * BALL_R) {
            const d = Math.sqrt(d2) || 0.001;
            const ux = dx / d;
            const uy = dy / d;
            b.x = nx + ux * BALL_R;
            b.y = ny + uy * BALL_R;
            const dot = b.vx * ux + b.vy * uy;
            if (dot < 0) {
              b.vx -= 2 * dot * ux;
              b.vy -= 2 * dot * uy;
              b.vx *= 0.78;
              b.vy *= 0.78;
            }
          }
        }
        // cup
        const cup = hole().cup;
        const dc = Math.hypot(b.x - cup.x, b.y - cup.y);
        const sp = Math.hypot(b.vx, b.vy);
        if (dc < CUP_R - 2 && sp < 3.4) {
          b.vx = 0;
          b.vy = 0;
          b.x = cup.x;
          b.y = cup.y;
          S.msg =
            S.strokes === 1
              ? '🎉 HOLE IN ONE!'
              : `⛳ Sunk in ${S.strokes}! +${puttHoleScore(S.strokes)} points`;
          syncHud();
          const hs = puttHoleScore(S.strokes);
          S.popups.push({ x: cup.x, y: cup.y - 24, text: S.strokes === 1 ? `ACE! +${hs}` : `+${hs}`, life: 1.25, color: '#ffd94d', size: S.strokes === 1 ? 22 : 18 });
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 130;
            S.particles.push({ x: cup.x, y: cup.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, r: 1.8 + Math.random() * 2.2, life: 0.7, color: ['#ffd94d', '#4ade80', '#ffffff'][i % 3] });
          }
          setTimeout(finishHole, 800);
        }
      }
    }

    function draw() {
      const h = hole();
      // felt — real green texture, flat gradient until it loads
      if (imgBg.complete && imgBg.naturalWidth) {
        const sc = Math.max(W / imgBg.naturalWidth, H / imgBg.naturalHeight);
        const bw = imgBg.naturalWidth * sc;
        const bh = imgBg.naturalHeight * sc;
        ctx.drawImage(imgBg, (W - bw) / 2, (H - bh) / 2, bw, bh);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#15803d');
        grad.addColorStop(1, '#166534');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }
      // fx aging (visual only, fixed-step)
      for (const pt of S.particles) { pt.x += pt.vx / 60; pt.y += pt.vy / 60; pt.vy += 300 / 60; pt.life -= 1 / 60; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y -= 30 / 60; pu.life -= 0.85 / 60; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 12;
      ctx.strokeRect(0, 0, W, H);
      // fairway sheen
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(20, 20, W - 40, H - 40);
      // walls
      for (const wl of h.walls) {
        ctx.fillStyle = '#92400e';
        ctx.beginPath();
        ctx.roundRect(wl.x, wl.y, wl.w, wl.h, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(wl.x, wl.y, wl.w, 3);
      }
      // cup + flag
      ctx.beginPath();
      ctx.arc(h.cup.x, h.cup.y, CUP_R, 0, 2 * Math.PI);
      ctx.fillStyle = '#052e16';
      ctx.fill();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h.cup.x, h.cup.y);
      ctx.lineTo(h.cup.x, h.cup.y - 30);
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(h.cup.x, h.cup.y - 30);
      ctx.lineTo(h.cup.x + 13, h.cup.y - 25);
      ctx.lineTo(h.cup.x, h.cup.y - 20);
      ctx.fill();
      // aim
      const b = S.ball;
      if (S.aiming && !moving()) {
        const { dx, dy } = S.aiming;
        const len = Math.hypot(dx, dy);
        if (len > 6) {
          const power = Math.min(1, len / 150);
          ctx.strokeStyle = `rgba(250, 204, 21, ${0.35 + power * 0.6})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(b.x, b.y);
          ctx.lineTo(b.x - dx * (0.4 + power * 1.1), b.y - dy * (0.4 + power * 1.1));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // ball trail
      S.trail.forEach((tp, i) => {
        ctx.globalAlpha = (i / S.trail.length) * 0.33;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 2 + (i / S.trail.length) * (BALL_R - 2), 0, 2 * Math.PI);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // ball
      const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(1, '#cbd5e1');
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, 2 * Math.PI);
      ctx.fillStyle = bg;
      ctx.fill();
      // sink confetti + score popup
      for (const pt of S.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 1.8));
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const pu of S.popups) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pu.life));
        ctx.font = `900 ${pu.size}px system-ui`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(4,40,16,0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(pu.text, pu.x, pu.y);
        ctx.fillStyle = pu.color;
        ctx.fillText(pu.text, pu.x, pu.y);
      }
      ctx.globalAlpha = 1;
    }

    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      step();
      draw();
    };
    raf = requestAnimationFrame(loop);

    // pointer aiming (slingshot: drag back, release fires opposite)
    const toLocal = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * W,
        y: ((e.clientY - r.top) / r.height) * H,
      };
    };
    let dragStart = null;
    const down = (e) => {
      if (S.over || moving()) return;
      dragStart = toLocal(e);
      S.aiming = { dx: 0, dy: 0 };
    };
    const move = (e) => {
      if (!dragStart) return;
      const p = toLocal(e);
      S.aiming = { dx: p.x - dragStart.x, dy: p.y - dragStart.y };
    };
    const up = () => {
      if (!dragStart || !S.aiming) return;
      const { dx, dy } = S.aiming;
      const len = Math.hypot(dx, dy);
      dragStart = null;
      S.aiming = null;
      if (len > 10) {
        const angle = (Math.atan2(-dy, -dx) * 180) / Math.PI;
        S.shoot(angle, Math.min(1, len / 150));
      }
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    window.__frgPutt = {
      state: () => ({
        hole: S.holeIdx + 1,
        strokes: S.strokes,
        strokesPerHole: [...S.strokesPerHole],
        score: S.score,
        over: S.over,
        moving: moving(),
        ball: { x: Math.round(S.ball.x), y: Math.round(S.ball.y) },
        cup: { x: hole().cup.x, y: hole().cup.y },
      }),
      shoot: (angleDeg, power) => S.shoot(angleDeg, power),
    };

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      delete window.__frgPutt;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 430, margin: '0 auto', padding: 12 }}>
      <h2 className="game-title">🏌️ FRG MINI PUTT</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>HOLE <b>{hud.hole}/3</b></span>
        <span>STROKES <b>{hud.strokes}</b></span>
        <span>SCORE <b>{hud.score}</b></span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ width: '100%', display: 'block', borderRadius: 12, touchAction: 'none' }}
      />
      <p style={{ textAlign: 'center', minHeight: 22 }}>{hud.msg}</p>
      <p className="fineprint">
        Drag back and release to putt — an ace pays 240. Tiers: 120→5 ·
        220→10 · 320→15 · 440→22 · 560→32 · 680→45.
      </p>
    </main>
  );
}
