import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// ---------------------------------------------------------------------------
// FRG Crossing — Frogger-style lane dodging, now in REAL 3D (Three.js):
// a street diorama with raised asphalt lanes, grass medians, low-poly
// 3D cars and a little gold runner who hops between lanes. Every
// crossing pays exactly 150, so the server re-derives the score from
// the crossing count alone. The logic below is the original verbatim;
// only the renderer changed.
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
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, crossings: 0, lives: 3, msg: 'Swipe, tap the arrows, or use arrow keys to cross!' });

  useEffect(() => {
    const startedAt = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

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
      hop: null, // {from, to, at} — presentation only
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
      S.hop = null;
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
      S.hop = { from: { ...S.player }, to: { ...p }, at: performance.now() };
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

    function stepLogic(now, dt) {
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
      scene.background = new THREE.Color(0x0b1220);
      scene.fog = new THREE.Fog(0x0b1220, 1300, 3000);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(200, 316, 668);
      camera.lookAt(200, 262, 0);

      scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x1c2a1c, 1.55));
      const sun = new THREE.DirectionalLight(0xfff1cf, 2.0);
      sun.position.set(160, 420, 520);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fb2ff, 0.6);
      fill.position.set(-260, 140, 300);
      scene.add(fill);

      const wy = (gy) => H - gy;
      const rowY = (r) => wy(r * CELL + CELL / 2);

      // street diorama: a base slab, raised asphalt lanes, grass
      // medians and spawn curb, a gold goal strip
      {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(W + 26, H + 26, 14),
          new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
        );
        base.position.set(W / 2, H / 2, -9);
        scene.add(base);
        const asphalt = new THREE.MeshStandardMaterial({ color: 0x1c2536, roughness: 0.95 });
        const asphaltAlt = new THREE.MeshStandardMaterial({ color: 0x232f47, roughness: 0.95 });
        const grass = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.9 });
        const gold = new THREE.MeshStandardMaterial({ color: 0xd9a62e, roughness: 0.4, metalness: 0.5, emissive: 0xd9a62e, emissiveIntensity: 0.18 });
        const laneGeo = new THREE.BoxGeometry(W, CELL - 1.5, 7);
        for (let r = 0; r < ROWS; r++) {
          const mat = r === GOAL_ROW ? gold : (r === SPAWN.row || MEDIAN_ROWS.has(r)) ? grass : (r % 2 ? asphaltAlt : asphalt);
          const m = new THREE.Mesh(laneGeo, mat);
          m.position.set(W / 2, rowY(r), 0);
          scene.add(m);
        }
        // dashed lane paint
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.4 });
        const dashGeo = new THREE.BoxGeometry(15, 2, 1.2);
        for (let r = 0; r < ROWS; r++) {
          if (r === GOAL_ROW || MEDIAN_ROWS.has(r) || r === SPAWN.row) continue;
          for (let x = 8; x < W; x += 34) {
            const d = new THREE.Mesh(dashGeo, dashMat);
            d.position.set(x, rowY(r) - CELL / 2 + 1, 4.2);
            scene.add(d);
          }
        }
      }
      // low-poly 3D cars (top-down diorama scale), built at exact length
      function makeCar(colorHex, len, dir) {
        const g = new THREE.Group();
        const paint = new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.32, metalness: 0.5, emissive: new THREE.Color(colorHex), emissiveIntensity: 0.12 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(len, 30, 15), paint);
        body.position.z = 8;
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(len * 0.52, 17, 9),
          new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.15, metalness: 0.3 })
        );
        cabin.position.set(-len * 0.03 * dir, 0, 17);
        const wheelGeo = new THREE.CylinderGeometry(5.4, 5.4, 3.4, 10);
        wheelGeo.rotateX(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.9 });
        const parts = [body, cabin];
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.position.set(sx * len * 0.33, sy * 16.4, 4);
            parts.push(w);
          }
        }
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
        const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a30 });
        for (const sy of [-1, 1]) {
          const h = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3), lightMat);
          h.position.set(dir * len * 0.49, sy * 11, 9);
          const t = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 3), tailMat);
          t.position.set(-dir * len * 0.49, sy * 11, 9);
          parts.push(h, t);
        }
        g.add(...parts);
        scene.add(g);
        return g;
      }
      const carMeshes = [];
      for (const lane of S.cars) {
        for (const c of lane.items) {
          carMeshes.push({ lane, c, mesh: makeCar(lane.color, c.w, lane.speed > 0 ? 1 : -1) });
        }
      }
      // the runner — a little gold 3D figure
      const runner = new THREE.Group();
      {
        const suit = new THREE.MeshStandardMaterial({ color: 0xf7b733, roughness: 0.4, metalness: 0.3, emissive: 0xf7b733, emissiveIntensity: 0.14 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(8.6, 10, 4, 10), suit);
        body.rotation.x = Math.PI / 2;
        body.position.z = 4;
        const head = new THREE.Mesh(
          new THREE.SphereGeometry(6.4, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xffd9a8, roughness: 0.6 })
        );
        head.position.z = 17;
        runner.add(body, head);
        scene.add(runner);
      }

      function syncScene(now) {
        for (const { lane, c, mesh } of carMeshes) {
          mesh.position.set(c.x + c.w / 2, rowY(lane.row), 4);
        }
        // runner with a little hop between cells
        let px = S.player.col * CELL + CELL / 2;
        let py = rowY(S.player.row);
        let pz = 10;
        if (S.hop) {
          const t = Math.min(1, (now - S.hop.at) / 140);
          const fx = S.hop.from.col * CELL + CELL / 2;
          const fy = rowY(S.hop.from.row);
          px = fx + (px - fx) * t;
          py = fy + (py - fy) * t;
          pz = 10 + Math.sin(t * Math.PI) * 13;
          if (t >= 1) S.hop = null;
        }
        const blink = now < S.invulnUntil && Math.floor(now / 160) % 2 === 0;
        runner.visible = !blink;
        runner.position.set(px, py, pz);
      }

      // ---------- overlay: goal banner ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        octx.fillStyle = '#fef08a';
        octx.font = '700 17px system-ui';
        octx.textAlign = 'center';
        octx.fillText('🏁 G O A L 🏁', W / 2, 26);
      }

      let last = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(50, now - last);
        last = now;
        stepLogic(now, dt);
        syncScene(now);
        renderer.render(scene, camera);
        drawOverlay();
      };
      raf = requestAnimationFrame(frame);

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

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgCrossing;
      };
    })();

    const key = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (map[e.key]) {
        e.preventDefault();
        S.move(map[e.key]);
      }
    };
    window.addEventListener('keydown', key);
    const mountEl = mountRef.current;
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
    if (mountEl) {
      mountEl.addEventListener('touchstart', ts, { passive: true });
      mountEl.addEventListener('touchend', te, { passive: true });
    }

    return () => {
      disposed = true;
      cleanup3d();
      window.removeEventListener('keydown', key);
      if (mountEl) {
        mountEl.removeEventListener('touchstart', ts);
        mountEl.removeEventListener('touchend', te);
      }
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
      <h2 className="game-title">🚦 FRG CROSSING 3D</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>SCORE <b>{hud.score}</b></span>
        <span>CROSSED <b>{hud.crossings}</b></span>
        <span>{'❤️'.repeat(Math.max(0, hud.lives))}</span>
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
      <div style={{ display: 'flex', gap: 8, maxWidth: 260, margin: '0 auto' }}>
        {pad('left', '◀')}
        {pad('up', '▲')}
        {pad('down', '▼')}
        {pad('right', '▶')}
      </div>
      <p className="fineprint">
        Every crossing pays 150 and speeds the traffic up. Tiers: 150→5 ·
        300→10 · 450→15 · 600→22 · 900→32 · 1,200→45.
      </p>
    </main>
  );
}
