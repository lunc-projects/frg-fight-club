import { useEffect, useRef } from 'react';

// FRG Slice — gems arc up the screen; swipe through them to slice.
// Gold gems +50, coins +25, the rare jewel +100; slicing 3+ in one
// swipe pays a combo bonus. Slice a bomb or let three good items
// fall past you and the run ends. Score converts to FRG by tiers
// (the server re-derives them exactly).
export const SLICE_TIERS = [
  { min: 5000, amount: 45 },
  { min: 3500, amount: 32 },
  { min: 2500, amount: 22 },
  { min: 1700, amount: 15 },
  { min: 1100, amount: 10 },
  { min: 600, amount: 5 },
];
export function sliceAmount(score) {
  const t = SLICE_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const W = 400;
const H = 520;
const GRAV = 1050;
const PTS = { gem: 50, coin: 25, jewel: 100 };

export default function Slice({ onFinish }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const start = Date.now();
    const imgBg = new Image();
    imgBg.src = '/art/slice-bg.webp';
    const SPRITES = {};
    for (const [t, f] of [['gem', 'slice-gem'], ['coin', 'slice-coin'], ['jewel', 'slice-jewel'], ['bomb', 'slice-bomb']]) {
      const im = new Image();
      im.src = `/art/${f}.webp`;
      SPRITES[t] = im;
    }
    let nextId = 1;
    const S = {
      score: 0,
      lives: 3,
      over: false,
      slicedCount: 0,
      items: [], // {id,x,y,vx,vy,rot,vr,type,r,sliced}
      halves: [], // {x,y,vx,vy,rot,vr,type,life}
      trail: [], // {x,y,at}
      strokeSlices: 0,
      pointerDown: false,
      spawnAt: Date.now() + 500,
      shake: 0,
      msg: 'Swipe the gems — dodge the bombs!',
      msgAt: Date.now(),
    };

    function say(m) { S.msg = m; S.msgAt = Date.now(); }

    function spawn() {
      const roll = Math.random();
      const elapsed = (Date.now() - start) / 1000;
      const bombChance = Math.min(0.22, 0.13 + elapsed / 600);
      let type = 'gem';
      if (roll < bombChance) type = 'bomb';
      else if (roll < bombChance + 0.09) type = 'jewel';
      else if (roll < bombChance + 0.42) type = 'coin';
      const x = 50 + Math.random() * (W - 100);
      S.items.push({
        id: nextId++,
        x,
        y: H + 24,
        vx: (RX_TARGET(x) - x) * 0.35 + (Math.random() - 0.5) * 60,
        vy: -(660 + Math.random() * 170),
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 5,
        type,
        r: type === 'gem' ? 18 : type === 'bomb' ? 17 : 15,
        sliced: false,
      });
    }
    function RX_TARGET(x) { return W / 2 + (x - W / 2) * 0.4; }

    function loseLife(why) {
      S.lives -= 1;
      S.shake = 0.5;
      if (S.lives <= 0) { finish(); }
      else say(`${why} — ${S.lives} ${S.lives === 1 ? 'life' : 'lives'} left`);
    }

    function sliceItem(it) {
      it.sliced = true;
      if (it.type === 'bomb') {
        S.halves.push({ x: it.x, y: it.y, vx: -40, vy: -60, rot: 0, vr: 2, type: 'boom', life: 0.45 });
        loseLife('💣 Bomb sliced!');
        return;
      }
      S.score += PTS[it.type];
      S.slicedCount += 1;
      S.strokeSlices += 1;
      for (const s of [-1, 1]) {
        S.halves.push({
          x: it.x, y: it.y,
          vx: it.vx + s * (60 + Math.random() * 50),
          vy: it.vy * 0.4 - 40,
          rot: it.rot, vr: it.vr + s * 3,
          type: it.type, life: 0.7,
        });
      }
    }

    function segDist(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const L2 = dx * dx + dy * dy || 1;
      let t = ((px - x1) * dx + (py - y1) * dy) / L2;
      t = Math.max(0, Math.min(1, t));
      const cx = x1 + t * dx, cy = y1 + t * dy;
      return Math.hypot(px - cx, py - cy);
    }

    function bladeSweep(x1, y1, x2, y2) {
      for (const it of S.items) {
        if (it.sliced) continue;
        if (segDist(it.x, it.y, x1, y1, x2, y2) < it.r + 7) sliceItem(it);
      }
    }

    function endStroke() {
      if (S.strokeSlices >= 3) {
        const bonus = 25 * (S.strokeSlices - 2);
        S.score += bonus;
        say(`⚔️ Combo ×${S.strokeSlices}! +${bonus}`);
      }
      S.strokeSlices = 0;
    }

    function finish() {
      if (S.over) return;
      S.over = true;
      const amount = sliceAmount(S.score);
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: S.score,
          amount,
          sliced: S.slicedCount,
          durationMs: Date.now() - start,
        });
      }, 1000);
    }

    let raf = 0;
    let last = performance.now();
    function step(now) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const tNow = Date.now();
      if (!S.over) {
        if (tNow >= S.spawnAt) {
          spawn();
          if (Math.random() < 0.3) spawn();
          const elapsed = (tNow - start) / 1000;
          S.spawnAt = tNow + Math.max(430, 780 - elapsed * 6) + Math.random() * 220;
        }
        for (const it of S.items) {
          it.vy += GRAV * dt;
          it.x += it.vx * dt;
          it.y += it.vy * dt;
          it.rot += it.vr * dt;
        }
        for (const it of S.items) {
          if (!it.sliced && it.y > H + 30 && it.vy > 0) {
            it.sliced = true; // resolved (missed)
            it.missed = true;
            if (it.type !== 'bomb') loseLife('Missed one');
            if (S.over) break;
          }
        }
        // blade trail sweep
        const pts = S.trail.filter((p) => tNow - p.at < 110);
        for (let i = 1; i < pts.length; i++) {
          bladeSweep(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        }
        S.trail = pts;
      }
      for (const h of S.halves) {
        h.vy += GRAV * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
        h.life -= dt;
      }
      S.halves = S.halves.filter((h) => h.life > 0);
      S.shake = Math.max(0, S.shake - dt);
      draw();
    }

    function drawItem(it, half) {
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      if (half) ctx.globalAlpha = Math.max(0, Math.min(1, it.life * 1.6));
      const spr = SPRITES[it.type];
      if (spr && spr.complete && spr.naturalWidth) {
        const dh = it.type === 'bomb' ? it.r * 3.2 : it.type === 'jewel' ? it.r * 3.0 : it.r * 2.6;
        const dw = dh * (spr.naturalWidth / spr.naturalHeight);
        const yOff = it.type === 'bomb' ? -dh * 0.11 : 0;
        ctx.drawImage(spr, -dw / 2, -dh / 2 + yOff, dw, dh);
        ctx.restore();
        return;
      }
      if (it.type === 'gem' || it.type === 'jewel') {
        const c = it.type === 'gem' ? '#ffc93c' : '#4de3ff';
        const cd = it.type === 'gem' ? '#c07f00' : '#1b7ea6';
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, -it.r);
        ctx.lineTo(it.r * 0.8, -it.r * 0.3);
        ctx.lineTo(it.r * 0.6, it.r * 0.8);
        ctx.lineTo(-it.r * 0.6, it.r * 0.8);
        ctx.lineTo(-it.r * 0.8, -it.r * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = cd;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-it.r * 0.8, -it.r * 0.3);
        ctx.lineTo(it.r * 0.8, -it.r * 0.3);
        ctx.moveTo(0, -it.r);
        ctx.lineTo(0, it.r * 0.8);
        ctx.stroke();
      } else if (it.type === 'coin') {
        ctx.fillStyle = '#ffd94d';
        ctx.beginPath();
        ctx.arc(0, 0, it.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#c07f00';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#a86e00';
        ctx.font = `bold ${it.r}px system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText('F', 0, it.r * 0.36);
      } else if (it.type === 'bomb') {
        ctx.fillStyle = '#1c2433';
        ctx.beginPath();
        ctx.arc(0, 0, it.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(-it.r * 0.35, -it.r * 0.35, it.r * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a6d3b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(2, -it.r);
        ctx.quadraticCurveTo(8, -it.r - 8, 13, -it.r - 6);
        ctx.stroke();
        ctx.fillStyle = '#ffb347';
        ctx.beginPath();
        ctx.arc(14, -it.r - 6, 3 + Math.random() * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (it.type === 'boom') {
        ctx.fillStyle = 'rgba(255,120,40,0.85)';
        ctx.font = '26px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('💥', 0, 9);
      }
      ctx.restore();
    }

    function draw() {
      ctx.save();
      if (S.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * S.shake, (Math.random() - 0.5) * 8 * S.shake);
      if (imgBg.complete && imgBg.naturalWidth) {
        const sc = Math.max(W / imgBg.naturalWidth, H / imgBg.naturalHeight);
        const bw = imgBg.naturalWidth * sc;
        const bh = imgBg.naturalHeight * sc;
        ctx.drawImage(imgBg, (W - bw) / 2, (H - bh) / 2, bw, bh);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#0a1122');
        grad.addColorStop(1, '#12203d');
        ctx.fillStyle = grad;
        ctx.fillRect(-10, -10, W + 20, H + 20);
      }
      for (const it of S.items) if (!it.sliced) drawItem(it, false);
      for (const h of S.halves) drawItem(h, true);
      // blade trail
      const pts = S.trail;
      if (pts.length > 1) {
        ctx.strokeStyle = 'rgba(160,230,255,0.85)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
      ctx.restore();
      if (S.over) {
        ctx.fillStyle = 'rgba(4,8,16,0.7)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 25px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('TIME UP ON LIVES', W / 2, H / 2 - 6);
        ctx.font = '15px system-ui';
        ctx.fillStyle = '#f5c542';
        ctx.fillText(`${S.slicedCount} sliced · ${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
      }
      dom();
    }

    const el = {
      score: document.getElementById('sl-score'),
      lives: document.getElementById('sl-lives'),
      next: document.getElementById('sl-next'),
      msg: document.getElementById('sl-msg'),
    };
    function dom() {
      if (el.score) el.score.textContent = S.score.toLocaleString();
      if (el.lives) el.lives.textContent = '❤️'.repeat(Math.max(0, S.lives)) || '—';
      const nxt = SLICE_TIERS.filter((t) => S.score < t.min).pop();
      if (el.next) {
        const amt = sliceAmount(S.score);
        el.next.textContent = S.over
          ? amt > 0 ? `PAYS ${amt} PTS` : 'NO PAYOUT'
          : nxt ? `NEXT: ${nxt.amount} PTS @ ${nxt.min.toLocaleString()}` : 'MAX TIER!';
      }
      if (el.msg) el.msg.textContent = Date.now() - S.msgAt < 2400 ? S.msg : '';
    }

    function toLocal(e) {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: (cx / rect.width) * W, y: (cy / rect.height) * H };
    }
    function onDown(e) {
      S.pointerDown = true;
      S.strokeSlices = 0;
      const p = toLocal(e);
      S.trail.push({ ...p, at: Date.now() });
    }
    function onMove(e) {
      if (!S.pointerDown && e.pointerType === 'mouse' && e.buttons === 0) return;
      const p = toLocal(e);
      S.trail.push({ ...p, at: Date.now() });
    }
    function onUp() {
      if (S.pointerDown) endStroke();
      S.pointerDown = false;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    window.__frgSlice = {
      state: () => ({
        score: S.score, lives: S.lives, over: S.over, sliced: S.slicedCount,
        items: S.items.filter((i) => !i.sliced).map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), vy: Math.round(i.vy), type: i.type })),
      }),
      swipe: (x1, y1, x2, y2) => { S.strokeSlices = 0; bladeSweep(x1, y1, x2, y2); endStroke(); },
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      delete window.__frgSlice;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">⚔️ FRG SLICE</h2>
      <div className="pb-hud">
        <div>SCORE <b id="sl-score">0</b></div>
        <div><b id="sl-lives">❤️❤️❤️</b></div>
        <div className="pb-next" id="sl-next">NEXT: 5 PTS @ 600</div>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="pb-canvas" />
      <div className="pb-msg" id="sl-msg" />
      <p className="pinball-note">
        Swipe through gems (+50), coins (+25) and jewels (+100) — 3 or
        more in one swipe pays a combo bonus. Slicing a bomb or letting
        three good items fall costs your 3 lives. Payouts: 600→5 ·
        1,100→10 · 1,700→15 · 2,500→22 · 3,500→32 · 5,000→45 PTS.
      </p>
    </div>
  );
}
