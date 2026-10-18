import { useEffect, useRef } from 'react';

// FRG Tower — precision stacking. A block slides across the top; tap
// to drop it. Whatever overhangs the block below is sliced off, so the
// tower narrows as it climbs. A perfect drop pays extra and keeps the
// full width. Miss entirely and the run ends. Score converts to FRG
// by tiers (the server re-derives them exactly).
export const TOWER_TIERS = [
  { min: 4000, amount: 45 },
  { min: 3000, amount: 32 },
  { min: 2300, amount: 22 },
  { min: 1700, amount: 15 },
  { min: 1200, amount: 10 },
  { min: 800, amount: 5 },
];
export function towerAmount(score) {
  const t = TOWER_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const W = 400;
const H = 520;
const BLOCK_H = 22;
const BASE_Y = H - 56;

export default function Tower({ onFinish }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const imgBg = new Image();
    imgBg.src = '/art/tower-bg.webp';
    const start = Date.now();
    const S = {
      score: 0,
      blocks: 0, // placed above the base
      over: false,
      stack: [{ x: 105, w: 190 }],
      cur: { x: -190, w: 190, dir: 1 },
      speed: 130,
      falling: [], // {x, y, w, vy, rot}
      msg: 'Tap to drop the block!',
      msgAt: Date.now(),
      perfects: 0,
      particles: [],
      popups: [],
    };

    function say(m) { S.msg = m; S.msgAt = Date.now(); }

    function finish(reason) {
      if (S.over) return;
      S.over = true;
      if (reason) say(reason);
      const amount = towerAmount(S.score);
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: S.score,
          amount,
          blocks: S.blocks,
          durationMs: Date.now() - start,
        });
      }, 1000);
    }

    function drop() {
      if (S.over) return;
      const prev = S.stack[S.stack.length - 1];
      const cur = S.cur;
      const left = Math.max(cur.x, prev.x);
      const right = Math.min(cur.x + cur.w, prev.x + prev.w);
      if (right <= left) {
        S.falling.push({ x: cur.x, y: 0, w: cur.w, vy: 60, rot: 0 });
        finish('Missed — the block fell!');
        return;
      }
      const perfect = Math.abs(cur.x - prev.x) <= 5;
      // sliced-off overhang pieces fall
      if (!perfect) {
        if (cur.x < left) S.falling.push({ x: cur.x, y: 0, w: left - cur.x, vy: 40, rot: -0.4 });
        if (cur.x + cur.w > right) S.falling.push({ x: right, y: 0, w: cur.x + cur.w - right, vy: 40, rot: 0.4 });
      }
      const placed = perfect ? { x: prev.x, w: prev.w } : { x: left, w: right - left };
      S.stack.push(placed);
      S.blocks += 1;
      const totalH2 = S.stack.length * BLOCK_H;
      const topY2 = totalH2 <= BASE_Y - 118 ? BASE_Y - totalH2 : 118;
      if (perfect) {
        S.perfects += 1;
        S.score += 150;
        say(`🎯 PERFECT! +150 (${S.perfects} in this tower)`);
        S.popups.push({ x: placed.x + placed.w / 2, y: topY2 - 8, text: 'PERFECT! +150', life: 1.1, color: '#ffd94d', size: 19 });
        for (let i = 0; i < 10; i++) {
          S.particles.push({ x: placed.x + Math.random() * placed.w, y: topY2 + 4, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 90, r: 1.8 + Math.random() * 2, life: 0.55, color: '#ffd94d' });
        }
      } else {
        S.score += 100;
        S.popups.push({ x: placed.x + placed.w / 2, y: topY2 - 8, text: '+100', life: 0.9, color: '#ffffff', size: 15 });
        for (let i = 0; i < 4; i++) {
          S.particles.push({ x: placed.x + Math.random() * placed.w, y: topY2 + BLOCK_H, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, r: 1.6 + Math.random() * 1.6, life: 0.4, color: '#cfe3ff' });
        }
      }
      if (placed.w < 14) { finish('Tower topped out — too thin to climb!'); return; }
      S.speed = Math.min(360, S.speed + 9);
      const fromLeft = S.blocks % 2 === 0;
      S.cur = { x: fromLeft ? -placed.w - 10 : W + 10, w: placed.w, dir: fromLeft ? 1 : -1 };
    }

    let raf = 0;
    let last = performance.now();
    function step(now) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!S.over) {
        const c = S.cur;
        c.x += c.dir * S.speed * dt;
        if (c.x > W + 30) { c.x = W + 30; c.dir = -1; }
        if (c.x + c.w < -30) { c.x = -30 - c.w; c.dir = 1; }
      }
      for (const f of S.falling) {
        f.y += f.vy * dt;
        f.vy += 900 * dt;
      }
      S.falling = S.falling.filter((f) => f.y < H + 80);
      for (const pt of S.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 320 * dt; pt.life -= dt; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y -= 32 * dt; pu.life -= dt * 0.9; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
      draw();
    }

    function drawBlock(x, y, w, i) {
      // Glossy 2026 blocks: shade gradient, glass gloss, beveled edge,
      // soft shadow under each block.
      const gold = i % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.roundRect(x, y + 3, w, BLOCK_H - 2, 3);
      ctx.fill();
      const gr = ctx.createLinearGradient(0, y, 0, y + BLOCK_H);
      if (gold) {
        gr.addColorStop(0, '#f6d878');
        gr.addColorStop(0.45, '#d9a92f');
        gr.addColorStop(1, '#96690f');
      } else {
        gr.addColorStop(0, '#54719f');
        gr.addColorStop(0.45, '#2c4470');
        gr.addColorStop(1, '#182a4e');
      }
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(x, y, w, BLOCK_H - 2, 3);
      ctx.fill();
      const gl = ctx.createLinearGradient(0, y, 0, y + BLOCK_H * 0.62);
      gl.addColorStop(0, 'rgba(255,255,255,0.34)');
      gl.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x + 1.5, y + 1.5, Math.max(0, w - 3), BLOCK_H * 0.5);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, w - 1, BLOCK_H - 3, 3);
      ctx.stroke();
      ctx.fillStyle = gold ? 'rgba(90,55,0,0.5)' : 'rgba(170,200,255,0.5)';
      for (const rx of [x + 7, x + w - 11]) {
        if (rx > x + 2 && rx < x + w - 4) ctx.fillRect(rx, y + BLOCK_H / 2 - 3, 4, 4);
      }
    }

    function draw() {
      if (imgBg.complete && imgBg.naturalWidth) {
        const sc = Math.max(W / imgBg.naturalWidth, H / imgBg.naturalHeight);
        const bw = imgBg.naturalWidth * sc;
        const bh = imgBg.naturalHeight * sc;
        ctx.drawImage(imgBg, (W - bw) / 2, (H - bh) / 2, bw, bh);
        ctx.fillStyle = 'rgba(16,10,40,0.16)';
        ctx.fillRect(0, 0, W, H);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a1122');
        grad.addColorStop(1, '#101d38');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#0d1730';
        ctx.fillRect(0, H - 34, W, 34);
        ctx.fillStyle = 'rgba(255,210,90,0.5)';
        for (let i = 0; i < 26; i++) {
          const wx = (i * 61) % W;
          const wy = H - 26 + ((i * 37) % 16);
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
      // The tower's top sits on the ground line while the tower is
      // short, then stays pinned at topY as it outgrows the screen.
      const topY = 118;
      const totalH = S.stack.length * BLOCK_H;
      const topBlockTopY = totalH <= BASE_Y - topY ? BASE_Y - totalH : topY;
      const topIndex = S.stack.length - 1;
      for (let i = topIndex; i >= 0; i--) {
        const y = topBlockTopY + (topIndex - i) * BLOCK_H;
        if (y > BASE_Y) break;
        drawBlock(S.stack[i].x, y, S.stack[i].w, i);
      }
      // ground line under tower base area
      ctx.fillStyle = '#1b2c4f';
      ctx.fillRect(0, BASE_Y + 2, W, 3);
      // falling pieces (aligned to the current block's drop line)
      for (const f of S.falling) {
        ctx.save();
        ctx.translate(f.x + f.w / 2, topBlockTopY - BLOCK_H + f.y + BLOCK_H / 2);
        ctx.rotate(f.rot * Math.min(1, f.y / 120));
        const fg = ctx.createLinearGradient(0, -BLOCK_H / 2, 0, BLOCK_H / 2);
        fg.addColorStop(0, '#c8a24a');
        fg.addColorStop(1, '#7c5c14');
        ctx.fillStyle = fg;
        ctx.fillRect(-f.w / 2, -BLOCK_H / 2, f.w, BLOCK_H - 2);
        ctx.restore();
      }
      // current sliding block
      if (!S.over) {
        const c = S.cur;
        const prev = S.stack[S.stack.length - 1];
        // guide line down to the tower top
        ctx.strokeStyle = 'rgba(245,197,66,0.35)';
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(prev.x, topBlockTopY);
        ctx.lineTo(prev.x, 64);
        ctx.moveTo(prev.x + prev.w, topBlockTopY);
        ctx.lineTo(prev.x + prev.w, 64);
        ctx.stroke();
        ctx.setLineDash([]);
        drawBlock(c.x, 76, c.w, S.stack.length);
      }
      for (const pt of S.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2));
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
        ctx.strokeStyle = 'rgba(20,8,40,0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(pu.text, pu.x, pu.y);
        ctx.fillStyle = pu.color;
        ctx.fillText(pu.text, pu.x, pu.y);
      }
      ctx.globalAlpha = 1;
      if (S.over) {
        ctx.fillStyle = 'rgba(4,8,16,0.66)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 25px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('TOWER DOWN', W / 2, H / 2 - 6);
        ctx.font = '15px system-ui';
        ctx.fillStyle = '#f5c542';
        ctx.fillText(`${S.blocks} blocks · ${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
      }
      dom();
    }

    const el = {
      score: document.getElementById('tw-score'),
      blocks: document.getElementById('tw-blocks'),
      next: document.getElementById('tw-next'),
      msg: document.getElementById('tw-msg'),
    };
    function dom() {
      if (el.score) el.score.textContent = S.score.toLocaleString();
      if (el.blocks) el.blocks.textContent = String(S.blocks);
      const nxt = TOWER_TIERS.filter((t) => S.score < t.min).pop();
      if (el.next) {
        const amt = towerAmount(S.score);
        el.next.textContent = S.over
          ? amt > 0 ? `PAYS ${amt} PTS` : 'NO PAYOUT'
          : nxt ? `NEXT: ${nxt.amount} PTS @ ${nxt.min.toLocaleString()}` : 'MAX TIER!';
      }
      if (el.msg) el.msg.textContent = Date.now() - S.msgAt < 2400 ? S.msg : '';
    }

    function onDown(e) {
      e.preventDefault();
      drop();
    }
    function onKey(e) {
      if (e.code === 'Space') { e.preventDefault(); drop(); }
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    window.__frgTower = {
      state: () => {
        const prev = S.stack[S.stack.length - 1];
        return {
          score: S.score, blocks: S.blocks, over: S.over,
          curX: Math.round(S.cur.x), curW: Math.round(S.cur.w),
          prevX: Math.round(prev.x), prevW: Math.round(prev.w),
          dir: S.cur.dir, speed: Math.round(S.speed),
        };
      },
      drop: () => drop(),
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      delete window.__frgTower;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">🏗️ FRG TOWER</h2>
      <div className="pb-hud">
        <div>SCORE <b id="tw-score">0</b></div>
        <div>BLOCKS <b id="tw-blocks">0</b></div>
        <div className="pb-next" id="tw-next">NEXT: 5 PTS @ 800</div>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="pb-canvas" />
      <div className="pb-msg" id="tw-msg" />
      <p className="pinball-note">
        Tap (or press space) to drop the sliding block. Overhangs get
        sliced off — land within a hair of perfect for +150 and no slice.
        Payouts: 800→5 · 1,200→10 · 1,700→15 · 2,300→22 · 3,000→32 ·
        4,000→45 PTS.
      </p>
    </div>
  );
}
