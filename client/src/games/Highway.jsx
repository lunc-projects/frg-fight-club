import { useEffect, useRef, useState } from 'react';

// FRG Highway — pseudo-3D endless driver. Weave the neon highway,
// skim past traffic for NEAR MISS bonuses, grab the gold coins — one
// crash ends the run. Score = distance/10 + 25 per coin + 50 per near
// miss; the server re-derives it exactly from the run's components.
export const HIGHWAY_TIERS = [
  { min: 4500, amount: 45 },
  { min: 3000, amount: 32 },
  { min: 2000, amount: 22 },
  { min: 1200, amount: 15 },
  { min: 700, amount: 10 },
  { min: 300, amount: 5 },
];
export function highwayPoints(score) {
  const t = HIGHWAY_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const W = 400;
const H = 560;
const SEG = 200; // segment length, world units
const NSEG = 300; // segments in the loop
const TRACK = SEG * NSEG;
const DRAW = 42; // segments drawn ahead
const ROAD_W = 2100; // road half-width in world units
const CAM_H = 1050;
const FOV = 100;
const CAM_DEPTH = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);
const PLAYER_Z = CAM_H * CAM_DEPTH;
const MAX_SPEED = SEG * 60; // 12000 units/s
const ACCEL = MAX_SPEED / 3.5;
const CENTRIFUGAL = 0.31;
const LANES_X = [-0.62, 0, 0.62];

function curveAt(i) {
  if (i < 18) return 0;
  const c = Math.sin(i * 0.013) * 1.35 + Math.sin(i * 0.0047 + 1.7) * 1.15;
  return Math.max(-2.3, Math.min(2.3, c));
}

export default function Highway({ onFinish }) {
  const canvasRef = useRef(null);
  const [hud, setHud] = useState({ kmh: 0, score: 0, dist: 0, coins: 0 });
  const [phase, setPhase] = useState('count');
  const S = useRef(null);
  if (!S.current) {
    S.current = {
      phase: 'count', countAt: performance.now(), startedAt: null, finishedAt: null,
      position: 0, playerX: 0, speed: 0, steer: 0, btnSteer: 0, dragX: null,
      cars: [], coins: [], nextCarZ: 2600, nextCoinZ: 5200,
      coinsGot: 0, nearMisses: 0, distance: 0, score: 0,
      popups: [], parts: [], streaks: [], callout: null, shake: 0,
      lastCalloutAt: 0, hudAt: 0, over: false, offroad: false,
    };
  }

  useEffect(() => {
    const s = S.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const imgSky = new Image(); imgSky.src = '/art/crash-bg.webp';
    const imgPlayer = new Image(); imgPlayer.src = '/art/highway-player.webp';
    const imgCarA = new Image(); imgCarA.src = '/art/traffic-a.webp';
    const imgCarB = new Image(); imgCarB.src = '/art/traffic-b.webp';
    const imgCoin = new Image(); imgCoin.src = '/art/slice-coin.webp';
    const carImgs = [imgCarA, imgCarB];

    // Build the segment loop
    const segments = [];
    for (let i = 0; i < NSEG; i++) {
      segments.push({
        index: i,
        curve: curveAt(i),
        p1: { world: { z: i * SEG }, camera: {}, screen: {} },
        p2: { world: { z: (i + 1) * SEG }, camera: {}, screen: {} },
        color: Math.floor(i / 3) % 2,
      });
    }
    const findSeg = (z) => segments[Math.floor(z / SEG) % NSEG];

    function project(p, cameraX, cameraY, cameraZ) {
      p.camera.x = 0 - cameraX;
      p.camera.y = 0 - cameraY;
      p.camera.z = p.world.z - cameraZ;
      p.screen.scale = CAM_DEPTH / Math.max(1, p.camera.z);
      p.screen.x = Math.round(W / 2 + (p.screen.scale * p.camera.x * W) / 2);
      p.screen.y = Math.round(H / 2 - (p.screen.scale * p.camera.y * H) / 2);
      p.screen.w = Math.round((p.screen.scale * ROAD_W * W) / 2);
    }

    function scoreNow() {
      return Math.floor(s.distance / 10) + s.coinsGot * 25 + s.nearMisses * 50;
    }

    function popup(x, y, text, color, size) {
      s.popups.push({ x, y, text, color: color || '#fff', size: size || 15, life: 1 });
    }
    function burst(x, y, color, n, spread) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (0.3 + Math.random() * 0.7) * (spread || 130);
        s.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.55 + Math.random() * 0.3, color, r: 2 + Math.random() * 2.4 });
      }
    }

    function spawnAhead() {
      const ahead = s.position + DRAW * SEG + 6000;
      while (s.nextCarZ < ahead) {
        const lane = LANES_X[Math.floor(Math.random() * 3)] + (Math.random() - 0.5) * 0.16;
        s.cars.push({
          z: s.nextCarZ, x: lane, img: Math.random() < 0.5 ? 0 : 1,
          speed: 3400 + Math.random() * 1900, passed: false, wob: Math.random() * Math.PI * 2,
        });
        s.nextCarZ += 6200 + Math.random() * 3600;
      }
      while (s.nextCoinZ < ahead) {
        if (Math.random() < 0.62) {
          s.coins.push({ z: s.nextCoinZ, x: LANES_X[Math.floor(Math.random() * 3)], taken: false });
        }
        s.nextCoinZ += 8200 + Math.random() * 3200;
      }
      // Recycle anything far behind
      const behind = s.position - 900;
      s.cars = s.cars.filter((c) => c.z > behind);
      s.coins = s.coins.filter((c) => c.z > behind && !c.taken);
    }

    function crash() {
      s.phase = 'crashed';
      s.finishedAt = performance.now();
      setPhase('crashed');
      s.shake = 14;
      burst(W / 2 + s.playerX * 40, H - 120, '#ffb03a', 26, 240);
      burst(W / 2 + s.playerX * 40, H - 120, '#ef4444', 18, 190);
      popup(W / 2, 190, '💥 CRASH!', '#ff6b5e', 30);
      setTimeout(() => {
        if (s.over) return;
        s.over = true;
        const score = scoreNow();
        const amount = highwayPoints(score);
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score, amount,
          coins: s.coinsGot, nearMisses: s.nearMisses, distance: s.distance,
          durationMs: Math.round((s.finishedAt || performance.now()) - (s.startedAt || s.countAt)),
        });
      }, 1500);
    }

    let raf;
    let last = performance.now();
    const step = (now) => {
      raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // --- phase & speed ------------------------------------------------------
      if (s.phase === 'count') {
        if (now - s.countAt > 2400) {
          s.phase = 'drive';
          s.startedAt = now;
          setPhase('drive');
          popup(W / 2, 190, 'GO! 🏁', '#4ade80', 30);
        }
      } else if (s.phase === 'drive') {
        const offroad = Math.abs(s.playerX) > 1.04;
        s.offroad = offroad;
        const target = offroad ? MAX_SPEED * 0.38 : MAX_SPEED;
        if (s.speed < target) s.speed = Math.min(target, s.speed + ACCEL * dt * (offroad ? 0.4 : 1));
        else s.speed = Math.max(target, s.speed - MAX_SPEED * 0.55 * dt);
      } else if (s.phase === 'crashed') {
        s.speed = Math.max(0, s.speed - MAX_SPEED * 1.4 * dt);
      }
      const speedPct = s.speed / MAX_SPEED;

      // --- steering ------------------------------------------------------------
      let steer = s.btnSteer;
      if (s.dragX != null) steer = Math.max(-1, Math.min(1, (s.dragX - W / 2) / 70));
      if (s.keys) steer = s.keys;
      s.steer = steer;
      if (s.phase === 'drive') {
        // Classic balance: steering authority and centrifugal push both
        // scale with speed (push with speed squared), so curves are
        // fightable at any pace if you commit to the steer.
        const baseRate = 2 * speedPct;
        s.playerX += steer * dt * baseRate * 1.9 * (0.35 + 0.65 * speedPct);
        const base = findSeg(s.position + PLAYER_Z);
        s.playerX -= dt * baseRate * speedPct * base.curve * CENTRIFUGAL;
        s.playerX = Math.max(-1.32, Math.min(1.32, s.playerX));
      }

      // --- advance -------------------------------------------------------------
      s.position = (s.position + s.speed * dt) % TRACK;
      const absolute = s.distance * 100; // meters→units bookkeeping below
      void absolute;
      if (s.phase === 'drive') {
        s.distance = Math.floor((s.distance * 100 + s.speed * dt) / 100);
        s.score = scoreNow();
        // distance callouts
        const m = s.distance;
        if (m > 0 && m % 500 < 6 && now - s.lastCalloutAt > 4000) {
          s.lastCalloutAt = now;
          s.callout = { text: `${Math.floor(m / 500) * 500}m! 🏎️`, at: now };
        }
      }

      // --- traffic & coins -------------------------------------------------------
      if (s.phase === 'drive' || s.phase === 'count') spawnAhead();
      const playerAbsZ = (s.position + PLAYER_Z) % TRACK;
      void playerAbsZ;
      // Use an unwrapped forward distance: compare via modular distance
      const fwd = (z) => {
        let d = (z - ((s.position + PLAYER_Z) % TRACK) + TRACK) % TRACK;
        if (d > TRACK / 2) d -= TRACK;
        return d;
      };
      if (s.phase === 'drive') {
        for (const car of s.cars) {
          car.z = (car.z + car.speed * dt) % TRACK;
          const d = fwd(car.z);
          car.rel = d;
          if (!car.passed && d < -SEG * 0.4) {
            car.passed = true;
            const gap = Math.abs(car.x - s.playerX);
            if (gap < 0.44) {
              crash();
              break;
            }
            if (gap < 0.80) {
              s.nearMisses += 1;
              popup(W / 2 + (car.x - s.playerX) * 120, 300, 'NEAR MISS +50', '#ffd94d', 19);
              burst(W / 2 + (car.x - s.playerX) * 130, H - 130, '#ffd94d', 8, 120);
            }
          }
        }
        if (s.phase === 'drive') {
          for (const coin of s.coins) {
            const d = fwd(coin.z);
            if (!coin.taken && d < SEG * 0.3 && d > -SEG * 0.5 && Math.abs(coin.x - s.playerX) < 0.31) {
              coin.taken = true;
              s.coinsGot += 1;
              popup(W / 2 + (coin.x - s.playerX) * 130, 320, '+25', '#ffd94d', 17);
              burst(W / 2 + (coin.x - s.playerX) * 130, H - 150, '#ffd94d', 7, 100);
            }
          }
        }
      } else {
        for (const car of s.cars) car.rel = fwd(car.z);
      }

      // --- fx aging ---------------------------------------------------------------
      for (const pu of s.popups) { pu.y -= 30 * dt; pu.life -= dt * 1.05; }
      s.popups = s.popups.filter((pu) => pu.life > 0);
      for (const pt of s.parts) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 320 * dt; pt.life -= dt; }
      s.parts = s.parts.filter((pt) => pt.life > 0);
      if (speedPct > 0.72 && s.phase === 'drive' && Math.random() < 0.5) {
        const side = Math.random() < 0.5 ? 6 : W - 6;
        s.streaks.push({ x: side + (Math.random() - 0.5) * 30, y: Math.random() * H * 0.5, len: 26 + Math.random() * 30, life: 0.28 });
      }
      for (const st of s.streaks) { st.y += 620 * dt; st.life -= dt; }
      s.streaks = s.streaks.filter((st) => st.life > 0 && st.y < H);
      if (s.callout && now - s.callout.at > 1100) s.callout = null;
      if (s.shake > 0) s.shake = Math.max(0, s.shake - 40 * dt);

      // --- HUD ---------------------------------------------------------------------
      if (now - s.hudAt > 120) {
        s.hudAt = now;
        setHud({ kmh: Math.round(speedPct * 238), score: s.score, dist: s.distance, coins: s.coinsGot });
      }

      draw(now);
    };

    function draw(now) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.shake > 0) ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake * 0.6);
      // Sky — night city strip
      if (imgSky.complete && imgSky.naturalWidth) {
        const sw = imgSky.naturalWidth;
        const sh = imgSky.naturalHeight;
        ctx.drawImage(imgSky, 0, sh * 0.08, sw, sh * 0.42, 0, 0, W, H * 0.46);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.46);
        g.addColorStop(0, '#0b1030');
        g.addColorStop(1, '#1a2450');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H * 0.46);
      }
      ctx.fillStyle = '#070a18';
      ctx.fillRect(0, H * 0.46, W, H * 0.54);

      // Road
      const baseSeg = findSeg(s.position);
      const basePct = (s.position % SEG) / SEG;
      const playerSeg = findSeg(s.position + PLAYER_Z);
      void playerSeg;
      let maxy = H;
      let x = 0;
      let ddx = -(baseSeg.curve * basePct);
      const drawn = [];
      for (let n = 0; n < DRAW; n++) {
        const seg = segments[(baseSeg.index + n) % NSEG];
        const looped = seg.index < baseSeg.index;
        seg.looped = looped;
        seg.clip = maxy;
        const camZ = s.position - (looped ? TRACK : 0);
        project(seg.p1, s.playerX * ROAD_W - x, CAM_H, camZ);
        project(seg.p2, s.playerX * ROAD_W - x - ddx, CAM_H, camZ);
        x += ddx;
        ddx += seg.curve;
        if (seg.p1.camera.z <= CAM_DEPTH || seg.p2.screen.y >= seg.p1.screen.y || seg.p2.screen.y >= maxy) continue;
        drawn.push(seg);
        // ground (shoulder)
        ctx.fillStyle = seg.color ? '#0a0e22' : '#090c1d';
        ctx.fillRect(0, seg.p2.screen.y, W, seg.p1.screen.y - seg.p2.screen.y);
        // neon edge strips
        const r1 = seg.p1.screen.w / 9;
        const r2 = seg.p2.screen.w / 9;
        ctx.fillStyle = seg.color ? '#ff2e88' : '#00e5ff';
        poly(ctx, seg.p1.screen.x - seg.p1.screen.w - r1, seg.p1.screen.y, seg.p1.screen.x - seg.p1.screen.w, seg.p1.screen.y, seg.p2.screen.x - seg.p2.screen.w, seg.p2.screen.y, seg.p2.screen.x - seg.p2.screen.w - r2, seg.p2.screen.y);
        poly(ctx, seg.p1.screen.x + seg.p1.screen.w + r1, seg.p1.screen.y, seg.p1.screen.x + seg.p1.screen.w, seg.p1.screen.y, seg.p2.screen.x + seg.p2.screen.w, seg.p2.screen.y, seg.p2.screen.x + seg.p2.screen.w + r2, seg.p2.screen.y);
        // asphalt
        ctx.fillStyle = seg.color ? '#232842' : '#20253c';
        poly(ctx, seg.p1.screen.x - seg.p1.screen.w, seg.p1.screen.y, seg.p1.screen.x + seg.p1.screen.w, seg.p1.screen.y, seg.p2.screen.x + seg.p2.screen.w, seg.p2.screen.y, seg.p2.screen.x - seg.p2.screen.w, seg.p2.screen.y);
        // lane lines
        if (seg.color === 0) {
          const l1 = seg.p1.screen.w / 26;
          const l2 = seg.p2.screen.w / 26;
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          for (const fx of [-1 / 3, 1 / 3]) {
            poly(ctx,
              seg.p1.screen.x + seg.p1.screen.w * fx - l1 / 2, seg.p1.screen.y,
              seg.p1.screen.x + seg.p1.screen.w * fx + l1 / 2, seg.p1.screen.y,
              seg.p2.screen.x + seg.p2.screen.w * fx + l2 / 2, seg.p2.screen.y,
              seg.p2.screen.x + seg.p2.screen.w * fx - l2 / 2, seg.p2.screen.y);
          }
        }
        maxy = seg.p1.screen.y;
      }

      // Sprites — far to near
      const spriteSeg = (z) => findSeg(z);
      const drawSprite = (item) => {
        const seg = spriteSeg(item.z);
        const pct = (item.z % SEG) / SEG;
        const scale = seg.p1.screen.scale + (seg.p2.screen.scale - seg.p1.screen.scale) * pct;
        const sx = seg.p1.screen.x + (seg.p2.screen.x - seg.p1.screen.x) * pct + (scale * item.x * ROAD_W * W) / 2;
        const sy = seg.p1.screen.y + (seg.p2.screen.y - seg.p1.screen.y) * pct;
        return { scale, sx, sy };
      };
      const visible = [];
      for (const car of s.cars) if (car.rel != null && car.rel > -SEG && car.rel < DRAW * SEG) visible.push({ kind: 'car', item: car, rel: car.rel });
      for (const coin of s.coins) {
        const d = (() => { let dd = (coin.z - ((s.position + PLAYER_Z) % TRACK) + TRACK) % TRACK; if (dd > TRACK / 2) dd -= TRACK; return dd; })();
        if (d > -SEG && d < DRAW * SEG) visible.push({ kind: 'coin', item: coin, rel: d });
      }
      visible.sort((a, b) => b.rel - a.rel);
      for (const v of visible) {
        const { scale, sx, sy } = drawSprite(v.item);
        if (v.kind === 'car') {
          const img = carImgs[v.item.img];
          const destW = (1150 * scale * W) / 2 * 2.15;
          const destH = destW * (img && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.8);
          if (img && img.complete && img.naturalWidth) {
            ctx.drawImage(img, sx - destW / 2, sy - destH, destW, destH);
          } else {
            ctx.fillStyle = '#c33';
            ctx.fillRect(sx - destW / 2, sy - destH, destW, destH);
          }
        } else {
          const spin = Math.abs(Math.sin(now / 240 + v.item.z));
          const destW = Math.max(3, (400 * scale * W) / 2 * 2.15 * (0.35 + 0.65 * spin));
          const destH = (400 * scale * W) / 2 * 2.15;
          ctx.save();
          ctx.shadowColor = 'rgba(255,200,60,0.8)';
          ctx.shadowBlur = 8;
          if (imgCoin.complete && imgCoin.naturalWidth) {
            ctx.drawImage(imgCoin, sx - destW / 2, sy - destH - destH * 0.4, destW, destH);
          }
          ctx.restore();
        }
      }

      // Player car
      const speedPct = s.speed / MAX_SPEED;
      const carW = 172;
      const carH = carW * (imgPlayer.naturalWidth ? imgPlayer.naturalHeight / imgPlayer.naturalWidth : 0.59);
      const px = W / 2 + s.steer * 9;
      const py = H - 14 + Math.sin(now / 90) * (speedPct > 0.05 ? 1.2 : 0);
      // exhaust flames at speed
      if (speedPct > 0.55 && s.phase === 'drive') {
        ctx.save();
        ctx.globalAlpha = 0.75 + Math.random() * 0.25;
        ctx.font = `${20 + Math.random() * 8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('🔥', px - 24, py - 2);
        ctx.fillText('🔥', px + 24, py - 2);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(px, py - carH / 2);
      ctx.rotate(s.steer * 0.045);
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 14;
      if (imgPlayer.complete && imgPlayer.naturalWidth) {
        ctx.drawImage(imgPlayer, -carW / 2, -carH / 2, carW, carH);
      } else {
        ctx.fillStyle = '#f7b733';
        ctx.fillRect(-carW / 2, -carH / 2, carW, carH);
      }
      ctx.restore();

      // speed streaks
      ctx.strokeStyle = 'rgba(160,220,255,0.5)';
      ctx.lineWidth = 2;
      for (const st of s.streaks) {
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.lineTo(st.x, st.y + st.len);
        ctx.stroke();
      }

      // particles
      for (const pt of s.parts) {
        ctx.globalAlpha = Math.max(0, pt.life * 1.8);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // popups
      for (const pu of s.popups) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pu.life));
        ctx.font = `900 ${pu.size}px system-ui`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(4,6,20,0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(pu.text, pu.x, pu.y);
        ctx.fillStyle = pu.color;
        ctx.fillText(pu.text, pu.x, pu.y);
      }
      ctx.globalAlpha = 1;

      // distance callout
      if (s.callout) {
        const age = now - s.callout.at;
        const sc = age < 200 ? 0.6 + (age / 200) * 0.5 : 1.1;
        ctx.save();
        ctx.translate(W / 2, 120);
        ctx.scale(sc, sc);
        ctx.globalAlpha = age > 800 ? Math.max(0, 1 - (age - 800) / 300) : 1;
        ctx.font = '900 27px system-ui';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(4,6,20,0.9)';
        ctx.lineWidth = 6;
        ctx.strokeText(s.callout.text, 0, 0);
        ctx.fillStyle = '#ffd94d';
        ctx.fillText(s.callout.text, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // countdown
      if (s.phase === 'count') {
        const el = (now - s.countAt) / 1000;
        const n = el < 0.7 ? '3' : el < 1.4 ? '2' : el < 2.1 ? '1' : 'GO!';
        ctx.fillStyle = 'rgba(3,5,16,0.35)';
        ctx.fillRect(0, 0, W, H);
        ctx.font = '900 74px system-ui';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(4,6,20,0.9)';
        ctx.lineWidth = 9;
        ctx.strokeText(n, W / 2, 250);
        ctx.fillStyle = n === 'GO!' ? '#4ade80' : '#ffd94d';
        ctx.fillText(n, W / 2, 250);
      }
      if (s.offroad && s.phase === 'drive') {
        ctx.font = '800 15px system-ui';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff9d5c';
        ctx.fillText('⚠️ OFF ROAD — SLOW!', W / 2, 34);
      }
    }

    function poly(c, x1, y1, x2, y2, x3, y3, x4, y4) {
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.lineTo(x3, y3);
      c.lineTo(x4, y4);
      c.closePath();
      c.fill();
    }

    raf = requestAnimationFrame(step);

    window.__frgHighway = {
      state: () => ({
        phase: s.phase,
        score: s.score,
        distance: s.distance,
        coins: s.coinsGot,
        nearMisses: s.nearMisses,
        playerX: Math.round(s.playerX * 100) / 100,
        speed: Math.round(s.speed),
        cars: s.cars.filter((c) => c.rel != null && c.rel > -400 && c.rel < 9000).map((c) => ({ rel: Math.round(c.rel), x: Math.round(c.x * 100) / 100 })),
      }),
      steer: (v) => { s.keys = v; },
    };

    return () => {
      cancelAnimationFrame(raf);
      delete window.__frgHighway;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = S.current;
  const setBtn = (v) => { s.btnSteer = v; };
  const onPointer = (e) => {
    if (e.type === 'pointerdown' || e.type === 'pointermove') {
      if (e.buttons || e.type === 'pointerdown') {
        const r = canvasRef.current.getBoundingClientRect();
        s.dragX = ((e.clientX - r.left) / r.width) * W;
      }
    }
    if (e.type === 'pointerup' || e.type === 'pointerleave') s.dragX = null;
  };

  return (
    <main className="flight-wrap">
      <h2 className="section">🏎️ FRG HIGHWAY</h2>
      <div className="flight-hud">
        <span>🏁 <b>{hud.dist}</b>m</span>
        <span>💨 <b>{hud.kmh}</b> km/h</span>
        <span>🪙 <b>{hud.coins}</b></span>
        <span>⭐ <b>{hud.score}</b></span>
      </div>
      <canvas
        ref={canvasRef}
        className="flight-canvas"
        style={{ width: '100%', maxWidth: W, aspectRatio: '400 / 560', touchAction: 'none' }}
        onPointerDown={onPointer}
        onPointerMove={onPointer}
        onPointerUp={onPointer}
        onPointerLeave={onPointer}
      />
      <div className="flight-controls">
        <button className="btn flight-btn" onPointerDown={() => setBtn(-1)} onPointerUp={() => setBtn(0)} onPointerLeave={() => setBtn(0)}>◀ STEER</button>
        <button className="btn flight-btn" onPointerDown={() => setBtn(1)} onPointerUp={() => setBtn(0)} onPointerLeave={() => setBtn(0)}>STEER ▶</button>
      </div>
      <p className="fineprint">
        Weave the traffic — skim past a car for a NEAR MISS +50, grab coins for +25,
        every 10m is +1. One crash ends the run. Points tiers: 300 → 5 · 700 → 10 ·
        1,200 → 15 · 2,000 → 22 · 3,000 → 32 · 4,500 → 45 PTS.
      </p>
    </main>
  );
}
