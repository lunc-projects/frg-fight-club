import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// ---------------------------------------------------------------------------
// FRG Mini Putt — 3 holes, drag-back slingshot putting, now in REAL 3D
// (Three.js): a raised wooden-framed green with a real 3D ball that
// rolls and banks off wooden rails, a flag marking the cup. Scoring is
// the original verbatim: a hole pays (7 - strokes) * 40 (ace = 240);
// a hole picked up after 7 strokes pays 0. The server re-derives the
// total EXACTLY from the per-hole stroke counts.
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
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const G = useRef(null);
  const [hud, setHud] = useState({ hole: 1, strokes: 0, score: 0, msg: 'Drag back from the ball and release to putt!' });

  useEffect(() => {
    const startedAt = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

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
            const spd = 40 + Math.random() * 130;
            S.particles.push({ x: cup.x, y: cup.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 60, r: 1.8 + Math.random() * 2.2, life: 0.7, color: ['#ffd94d', '#4ade80', '#ffffff'][i % 3] });
          }
          setTimeout(finishHole, 800);
        }
      }
    }

    function fxStep() {
      for (const pt of S.particles) { pt.x += pt.vx / 60; pt.y += pt.vy / 60; pt.vy += 300 / 60; pt.life -= 1 / 60; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y -= 30 / 60; pu.life -= 0.85 / 60; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
    }

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const mount = mountRef.current;
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x052e16);
      scene.fog = new THREE.Fog(0x052e16, 1300, 3000);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(200, 318, 664);
      camera.lookAt(200, 262, 0);

      scene.add(new THREE.HemisphereLight(0xeaffea, 0x14532d, 1.5));
      const sun = new THREE.DirectionalLight(0xfff6d8, 2.1);
      sun.position.set(150, 380, 540);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x9fe8ff, 0.5);
      fill.position.set(-260, 140, 300);
      scene.add(fill);

      const wy = (gy) => H - gy;

      // the green: wooden frame slab + felt top (club art)
      {
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(W + 26, H + 26, 18),
          new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 })
        );
        frame.position.set(W / 2, H / 2, -11);
        scene.add(frame);
        const tex = new THREE.TextureLoader().load('/art/putt-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const felt = new THREE.Mesh(
          new THREE.PlaneGeometry(W, H),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xb9d9b9 })
        );
        felt.position.set(W / 2, H / 2, -1.5);
        scene.add(felt);
      }
      // wooden rails (rebuilt per hole)
      const railMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.55 });
      let railMeshes = [];
      function buildRails() {
        for (const m of railMeshes) scene.remove(m);
        railMeshes = hole().walls.map((wl) => {
          const m = new THREE.Mesh(new THREE.BoxGeometry(wl.w, wl.h, 15), railMat);
          m.position.set(wl.x + wl.w / 2, wy(wl.y + wl.h / 2), 6);
          scene.add(m);
          return m;
        });
      }
      // cup + flag
      const cupGroup = new THREE.Group();
      {
        const cupMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(CUP_R, CUP_R, 3, 22),
          new THREE.MeshStandardMaterial({ color: 0x052e16, roughness: 0.9 })
        );
        cupMesh.rotation.x = Math.PI / 2;
        cupMesh.position.z = 1;
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(CUP_R + 0.6, 1.1, 8, 26),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
        );
        rim.position.z = 2.4;
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.5, 36, 8),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
        );
        pole.rotation.x = Math.PI / 2;
        pole.position.z = 19;
        const flagShape = new THREE.Shape();
        flagShape.moveTo(0, 0);
        flagShape.lineTo(15, -5.5);
        flagShape.lineTo(0, -11);
        flagShape.lineTo(0, 0);
        const flag = new THREE.Mesh(
          new THREE.ShapeGeometry(flagShape),
          new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide })
        );
        flag.position.set(0.8, 5.5, 36);
        cupGroup.add(cupMesh, rim, pole, flag);
        cupGroup.userData.flag = flag;
        scene.add(cupGroup);
      }
      function placeCup() {
        const c = hole().cup;
        cupGroup.position.set(c.x, wy(c.y), 0);
      }
      // ball — a real rolling sphere (+ contact disc as a soft shadow)
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(BALL_R, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.05 })
      );
      scene.add(ball);
      const ballShadow = new THREE.Mesh(
        new THREE.CircleGeometry(BALL_R + 1.5, 18),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
      );
      scene.add(ballShadow);
      // aim line
      let aimLine;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        aimLine = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xfacc15, dashSize: 7, gapSize: 6, transparent: true, opacity: 0.9 }));
        aimLine.frustumCulled = false;
        aimLine.visible = false;
        scene.add(aimLine);
      }
      // trail + confetti points
      let trailPts;
      let partPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3));
        trailPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 4.6, sizeAttenuation: false, transparent: true, opacity: 0.4 }));
        trailPts.frustumCulled = false;
        scene.add(trailPts);
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
        g2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
        partPts = new THREE.Points(g2, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }));
        partPts.frustumCulled = false;
        scene.add(partPts);
      }
      const colorCache = {};
      function rgb(hex) {
        if (!colorCache[hex]) {
          const n = parseInt(hex.slice(1), 16);
          colorCache[hex] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
        }
        return colorCache[hex];
      }

      let lastHole = -1;
      function syncScene(now) {
        if (S.holeIdx !== lastHole) {
          lastHole = S.holeIdx;
          buildRails();
          placeCup();
        }
        cupGroup.userData.flag.rotation.y = Math.sin(now / 340) * 0.35;
        const b = S.ball;
        ball.position.set(b.x, wy(b.y), BALL_R + 1);
        ball.rotation.y -= b.vx * 0.03;
        ball.rotation.x += b.vy * 0.03;
        ballShadow.position.set(b.x + 2, wy(b.y) - 2, 0.8);
        // aim
        if (S.aiming && !moving()) {
          const { dx, dy } = S.aiming;
          const len = Math.hypot(dx, dy);
          if (len > 6) {
            const power = Math.min(1, len / 150);
            const ex = b.x - dx * (0.4 + power * 1.1);
            const ey = b.y - dy * (0.4 + power * 1.1);
            const arr = aimLine.geometry.getAttribute('position');
            arr.setXYZ(0, b.x, wy(b.y), 5);
            arr.setXYZ(1, ex, wy(ey), 5);
            arr.needsUpdate = true;
            aimLine.computeLineDistances();
            aimLine.visible = true;
          } else aimLine.visible = false;
        } else aimLine.visible = false;
        // trail
        {
          const arr = trailPts.geometry.getAttribute('position');
          for (let i = 0; i < 13; i++) {
            const tp = S.trail[i];
            if (!tp) { arr.setXYZ(i, -100, -100, -100); continue; }
            arr.setXYZ(i, tp.x, wy(tp.y), 3);
          }
          arr.needsUpdate = true;
        }
        // confetti
        {
          const posA = partPts.geometry.getAttribute('position');
          const colA = partPts.geometry.getAttribute('color');
          for (let i = 0; i < 60; i++) {
            const pt = S.particles[i];
            if (!pt) { posA.setXYZ(i, -200, -200, -200); continue; }
            posA.setXYZ(i, pt.x, wy(pt.y), 14);
            const c = rgb(pt.color);
            colA.setXYZ(i, c[0], c[1], c[2]);
          }
          posA.needsUpdate = true;
          colA.needsUpdate = true;
        }
      }

      // ---------- overlay: score popups (game coordinates) ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        for (const pu of S.popups) {
          octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
          octx.font = `900 ${pu.size}px system-ui`;
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(4,40,16,0.85)';
          octx.lineWidth = 4;
          octx.strokeText(pu.text, pu.x, pu.y);
          octx.fillStyle = pu.color;
          octx.fillText(pu.text, pu.x, pu.y);
        }
        octx.globalAlpha = 1;
      }

      const frame = () => {
        raf = requestAnimationFrame(frame);
        step();
        fxStep();
        syncScene(performance.now());
        renderer.render(scene, camera);
        drawOverlay();
      };
      raf = requestAnimationFrame(frame);

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

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgPutt;
      };
    })();

    // pointer aiming (slingshot: drag back, release fires opposite)
    const mountEl = mountRef.current;
    const toLocal = (e) => {
      const r = mountEl.getBoundingClientRect();
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
    if (mountEl) {
      mountEl.addEventListener('pointerdown', down);
      mountEl.addEventListener('pointermove', move);
      mountEl.addEventListener('pointerup', up);
      mountEl.addEventListener('pointercancel', up);
    }

    return () => {
      disposed = true;
      cleanup3d();
      if (mountEl) {
        mountEl.removeEventListener('pointerdown', down);
        mountEl.removeEventListener('pointermove', move);
        mountEl.removeEventListener('pointerup', up);
        mountEl.removeEventListener('pointercancel', up);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 430, margin: '0 auto', padding: 12 }}>
      <h2 className="game-title">🏌️ FRG MINI PUTT 3D</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>HOLE <b>{hud.hole}/3</b></span>
        <span>STROKES <b>{hud.strokes}</b></span>
        <span>SCORE <b>{hud.score}</b></span>
      </div>
      <div
        ref={mountRef}
        style={{ position: 'relative', width: '100%', aspectRatio: '400 / 560', touchAction: 'none', borderRadius: 12, overflow: 'hidden' }}
      >
        <canvas
          ref={overlayRef}
          width={W}
          height={H}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
        />
      </div>
      <p style={{ textAlign: 'center', minHeight: 22 }}>{hud.msg}</p>
      <p className="fineprint">
        Drag back and release to putt — an ace pays 240. Tiers: 120→5 ·
        220→10 · 320→15 · 440→22 · 560→32 · 680→45.
      </p>
    </main>
  );
}
