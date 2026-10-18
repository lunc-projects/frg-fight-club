import { useEffect, useRef } from 'react';

// FRG Flight — one-tap rocket flying. Tap / click / space to flap,
// thread the rocket through the gate gaps, grab the coins sitting in
// the gaps. One touch of a pillar (or the ground) ends the run. Score
// converts to FRG by tiers (the server re-derives them exactly).
export const FLIGHT_TIERS = [
  { min: 3800, amount: 45 },
  { min: 2700, amount: 32 },
  { min: 2000, amount: 22 },
  { min: 1400, amount: 15 },
  { min: 900, amount: 10 },
  { min: 500, amount: 5 },
];
export function flightAmount(score) {
  const t = FLIGHT_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const W = 400;
const H = 520;
const RX = 96; // rocket x (fixed; the world scrolls)
const GAP = 138;
const GATE_W = 64;
const SPACING = 218;
const GRAV = 1500;
const FLAP_VY = -428;

export default function Flight({ onFinish }) {
  const canvasRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const start = Date.now();
    const imgBg = new Image();
    imgBg.src = '/art/flight-bg.webp';
    const imgRocket = new Image();
    imgRocket.src = '/art/flight-rocket.webp';
    const imgCoin = new Image();
    imgCoin.src = '/art/slice-coin.webp';
    const S = {
      score: 0,
      gates: 0,
      over: false,
      started: false,
      y: H / 2,
      vy: 0,
      speed: 165,
      pillars: [], // {x, cy, coin: bool, coinTaken, passed}
      stars: Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.8 + 0.4 })),
      scroll: 0,
      msg: 'Tap anywhere to flap!',
      msgAt: Date.now(),
      flame: 0,
    };
    let nextX = 430;
    function spawnPillar(x) {
      const cy = 120 + Math.random() * (H - 240);
      S.pillars.push({ x, cy, coin: Math.random() < 0.45, coinTaken: false, passed: false });
    }
    for (let i = 0; i < 3; i++) { spawnPillar(nextX); nextX += SPACING; }

    function flap() {
      if (S.over) return;
      S.started = true;
      S.vy = FLAP_VY;
      S.flame = 1;
    }
    function say(m) { S.msg = m; S.msgAt = Date.now(); }

    function finish() {
      S.over = true;
      const amount = flightAmount(S.score);
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: S.score,
          amount,
          gates: S.gates,
          durationMs: Date.now() - start,
        });
      }, 900);
    }

    let raf = 0;
    let last = performance.now();
    function step(now) {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!S.over && S.started) {
        S.vy = Math.min(760, S.vy + GRAV * dt);
        S.y += S.vy * dt;
        if (S.y < 14) { S.y = 14; S.vy = Math.max(0, S.vy); }
        const dx = S.speed * dt;
        S.scroll += dx;
        for (const st of S.stars) { st.x -= dx * 0.25; if (st.x < 0) { st.x = W; st.y = Math.random() * H; } }
        for (const p of S.pillars) {
          p.x -= dx;
          if (!p.passed && p.x + GATE_W < RX - 16) {
            p.passed = true;
            S.gates += 1;
            S.score += 100;
            S.speed = Math.min(238, S.speed + 2);
            if (S.gates % 5 === 0) say(`🚀 ${S.gates} gates!`);
          }
          if (p.coin && !p.coinTaken && Math.abs(p.x + GATE_W / 2 - RX) < 22 && Math.abs(p.cy - S.y) < 22) {
            p.coinTaken = true;
            S.score += 25;
          }
          // collision: rocket box vs pillar rects (above/below the gap)
          if (RX + 15 > p.x && RX - 15 < p.x + GATE_W) {
            if (S.y - 11 < p.cy - GAP / 2 || S.y + 11 > p.cy + GAP / 2) { finish(); }
          }
        }
        S.pillars = S.pillars.filter((p) => p.x > -GATE_W - 10);
        while (S.pillars.length < 3) {
          const lastX = S.pillars.length ? S.pillars[S.pillars.length - 1].x : nextX - SPACING;
          spawnPillar(lastX + SPACING);
        }
        if (S.y > H - 10) { S.y = H - 10; finish(); }
      }
      S.flame = Math.max(0, S.flame - dt * 5);
      draw();
    }

    function draw() {
      if (imgBg.complete && imgBg.naturalWidth) {
        const tw = imgBg.naturalWidth * (H / imgBg.naturalHeight);
        let off = -((S.scroll * 0.35) % tw);
        if (off > 0) off -= tw;
        for (let x = off; x < W; x += tw) ctx.drawImage(imgBg, x, 0, tw, H);
      } else {
        ctx.fillStyle = '#0a1122';
        ctx.fillRect(0, 0, W, H);
        for (const st of S.stars) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(st.x, st.y, st.s, st.s);
        }
      }
      // pillars
      for (const p of S.pillars) {
        const topH = p.cy - GAP / 2;
        const botY = p.cy + GAP / 2;
        const pg = ctx.createLinearGradient(p.x, 0, p.x + GATE_W, 0);
        pg.addColorStop(0, '#274069');
        pg.addColorStop(0.45, '#41619b');
        pg.addColorStop(1, '#1d2f52');
        ctx.fillStyle = pg;
        ctx.fillRect(p.x, 0, GATE_W, topH);
        ctx.fillRect(p.x, botY, GATE_W, H - botY);
        ctx.fillStyle = '#f5c542';
        ctx.fillRect(p.x - 3, topH - 12, GATE_W + 6, 12);
        ctx.fillRect(p.x - 3, botY, GATE_W + 6, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.fillRect(p.x + 7, 0, 5, topH - 12);
        ctx.fillRect(p.x + 7, botY + 12, 5, H - botY - 12);
        if (p.coin && !p.coinTaken) {
          const cxp = p.x + GATE_W / 2;
          if (imgCoin.complete && imgCoin.naturalWidth) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(cxp, p.cy, 11, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(imgCoin, cxp - 12, p.cy - 12, 24, 24);
            ctx.restore();
          } else {
            ctx.fillStyle = '#ffd94d';
            ctx.beginPath();
            ctx.arc(cxp, p.cy, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#a86e00';
            ctx.font = 'bold 10px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('F', cxp, p.cy + 3.5);
          }
        }
      }
      // ground
      ctx.fillStyle = '#16233f';
      ctx.fillRect(0, H - 6, W, 6);
      // rocket
      const tilt = Math.max(-0.5, Math.min(0.9, S.vy / 700));
      ctx.save();
      ctx.translate(RX, S.y);
      ctx.rotate(tilt);
      const hasSprite = imgRocket.complete && imgRocket.naturalWidth;
      if (S.flame > 0 || (S.started && !S.over)) {
        const fl = 12 + Math.random() * 10 + S.flame * 10;
        const tail = hasSprite ? -33 : -16;
        ctx.fillStyle = '#f0883e';
        ctx.beginPath();
        ctx.moveTo(tail, -4);
        ctx.lineTo(tail - fl, 0);
        ctx.lineTo(tail, 4);
        ctx.closePath();
        ctx.fill();
      }
      if (hasSprite) {
        ctx.drawImage(imgRocket, -35, -17, 70, 33);
        ctx.restore();
        afterRocket();
        return;
      }
      ctx.fillStyle = '#f5c542';
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.quadraticCurveTo(10, -10, -6, -9);
      ctx.lineTo(-16, -6);
      ctx.lineTo(-16, 6);
      ctx.lineTo(-6, 9);
      ctx.quadraticCurveTo(10, 10, 20, 0);
      ctx.fill();
      ctx.fillStyle = '#e5534b';
      ctx.beginPath();
      ctx.moveTo(-8, -8);
      ctx.lineTo(-18, -14);
      ctx.lineTo(-15, -4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(-18, 14);
      ctx.lineTo(-15, 4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#bfe3ff';
      ctx.beginPath();
      ctx.arc(6, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      afterRocket();
    }

    function afterRocket() {
      if (!S.started && !S.over) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = 'bold 19px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('TAP TO FLAP', W / 2, H / 2 - 90);
      }
      if (S.over) {
        ctx.fillStyle = 'rgba(4,8,16,0.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 26px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('CRASHED', W / 2, H / 2 - 8);
        ctx.font = '15px system-ui';
        ctx.fillStyle = '#f5c542';
        ctx.fillText(`${S.gates} gates · ${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
      }
      dom();
    }

    const el = {
      score: document.getElementById('fl-score'),
      gates: document.getElementById('fl-gates'),
      next: document.getElementById('fl-next'),
      msg: document.getElementById('fl-msg'),
    };
    function dom() {
      if (el.score) el.score.textContent = S.score.toLocaleString();
      if (el.gates) el.gates.textContent = String(S.gates);
      const nxt = FLIGHT_TIERS.filter((t) => S.score < t.min).pop();
      if (el.next) {
        const amt = flightAmount(S.score);
        el.next.textContent = S.over
          ? amt > 0 ? `PAYS ${amt} PTS` : 'NO PAYOUT'
          : nxt ? `NEXT: ${nxt.amount} PTS @ ${nxt.min.toLocaleString()}` : 'MAX TIER!';
      }
      if (el.msg) el.msg.textContent = Date.now() - S.msgAt < 2400 ? S.msg : '';
    }

    function onDown(e) {
      e.preventDefault();
      flap();
    }
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    window.__frgFlight = {
      state: () => {
        const p = S.pillars.find((x) => x.x + GATE_W >= RX - 16);
        return {
          score: S.score, gates: S.gates, over: S.over, started: S.started,
          y: Math.round(S.y), vy: Math.round(S.vy),
          nextGap: p ? { x: Math.round(p.x), cy: Math.round(p.cy) } : null,
        };
      },
      flap: () => flap(),
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      delete window.__frgFlight;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">🚀 FRG FLIGHT</h2>
      <div className="pb-hud">
        <div>SCORE <b id="fl-score">0</b></div>
        <div>GATES <b id="fl-gates">0</b></div>
        <div className="pb-next" id="fl-next">NEXT: 5 PTS @ 500</div>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="pb-canvas" />
      <div className="pb-msg" id="fl-msg" />
      <p className="pinball-note">
        Tap anywhere (or press space) to flap. Every gate is +100, the coin
        in a gap is +25 — one touch of a pillar or the ground ends the run.
        Payouts: 500→5 · 900→10 · 1,400→15 · 2,000→22 · 2,700→32 ·
        3,800→45 PTS.
      </p>
    </div>
  );
}
