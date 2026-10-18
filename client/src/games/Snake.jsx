import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// ---------------------------------------------------------------------------
// FRG Snake — the classic, now in REAL 3D (Three.js). Orbs pay 25, every
// 5th orb is golden and pays 60. The game logic is the original
// verbatim (the server re-derives the score EXACTLY from the orb
// counts — golden must equal floor(total/5)); only the renderer
// changed: the snake is a chain of real glossy 3D spheres with a gold
// head, slithering over a jungle board, chasing glowing orb spheres.
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
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const [hud, setHud] = useState({ score: 0, len: 4, msg: 'Swipe, tap the arrows, or use arrow keys. First move starts!' });

  useEffect(() => {
    const startedAt = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

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

    function stepLogic(dtMs) {
      if (S.started && !S.over) {
        S.acc += dtMs;
        const speed = Math.min(14, 7 + (S.orbs + S.golden) * 0.18); // ticks per second
        const stepMs = 1000 / speed;
        while (S.acc >= stepMs && !S.over) {
          S.acc -= stepMs;
          tick();
        }
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
      scene.background = new THREE.Color(0x04170c);
      scene.fog = new THREE.Fog(0x04170c, 1200, 2800);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(200, 332, 652);
      camera.lookAt(200, 244, 0);

      scene.add(new THREE.HemisphereLight(0xd8ffd8, 0x0a2e16, 1.5));
      const sun = new THREE.DirectionalLight(0xfff3cf, 2.0);
      sun.position.set(180, 420, 520);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fff9e, 0.5);
      fill.position.set(-240, 120, 300);
      scene.add(fill);

      const wy = (gy) => H - gy;
      const cx = (cellX) => cellX * CELL + CELL / 2;
      const cy = (cellY) => wy(cellY * CELL + CELL / 2);

      // jungle board: textured top on a thick slab with a gold rim
      {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(W + 22, H + 22, 20),
          new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.5, metalness: 0.4 })
        );
        slab.position.set(W / 2, H / 2, -13);
        scene.add(slab);
        const tex = new THREE.TextureLoader().load('/art/snake-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(W, H),
          new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d8d8 })
        );
        top.position.set(W / 2, H / 2, -2);
        scene.add(top);
      }
      // snake body — instanced glossy spheres, color tapering to the tail
      const MAXSEG = 300;
      const bodyMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry(CELL * 0.47, 16, 12),
        new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 0.1 }),
        MAXSEG
      );
      bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bodyMesh.frustumCulled = false;
      scene.add(bodyMesh);
      // head — gold sphere with eyes that face the travel direction
      const headGroup = new THREE.Group();
      {
        const gold = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.22, metalness: 0.35, emissive: 0xffc93c, emissiveIntensity: 0.15 });
        const head = new THREE.Mesh(new THREE.SphereGeometry(CELL * 0.52, 18, 14), gold);
        headGroup.add(head);
        const eyeW = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const eyeB = new THREE.MeshBasicMaterial({ color: 0x111827 });
        for (const sgn of [-1, 1]) {
          const w = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), eyeW);
          w.position.set(sgn * 4.6, 3.4, 7.6);
          const b = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 6), eyeB);
          b.position.set(sgn * 4.6, 3.4, 10.6);
          headGroup.add(w, b);
        }
        scene.add(headGroup);
      }
      // orb — glowing sphere + light
      const orbMesh = new THREE.Mesh(
        new THREE.SphereGeometry(8, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x4ade80, emissive: 0x22cc55, emissiveIntensity: 1.1, roughness: 0.25 })
      );
      scene.add(orbMesh);
      const orbLight = new THREE.PointLight(0x4ade80, 0.9, 130, 0);
      scene.add(orbLight);

      const tmpM = new THREE.Matrix4();
      const tmpC = new THREE.Color();
      const HEAD_COLOR = new THREE.Color(0x86efac);
      const TAIL_COLOR = new THREE.Color(0x15803d);

      function syncScene(now) {
        const n = Math.min(MAXSEG - 1, S.snake.length - 1);
        for (let i = 0; i < n; i++) {
          const seg = S.snake[i + 1];
          const f = S.snake.length <= 2 ? 0 : i / (S.snake.length - 2);
          tmpC.copy(HEAD_COLOR).lerp(TAIL_COLOR, Math.pow(f, 0.8));
          tmpM.makeTranslation(cx(seg.x), cy(seg.y), 10);
          bodyMesh.setMatrixAt(i, tmpM);
          bodyMesh.setColorAt(i, tmpC);
        }
        bodyMesh.count = n;
        bodyMesh.instanceMatrix.needsUpdate = true;
        if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
        // head
        const hd = S.snake[0];
        headGroup.position.set(cx(hd.x), cy(hd.y), 11);
        headGroup.rotation.z = Math.atan2(-S.dir.y, S.dir.x);
        // orb
        if (S.orb) {
          orbMesh.visible = true;
          orbLight.visible = true;
          const gold = S.orb.golden;
          orbMesh.position.set(cx(S.orb.x), cy(S.orb.y), 10 + Math.sin(now / 300) * 1.6);
          orbMesh.scale.setScalar(gold ? 1.25 : 1);
          orbMesh.material.color.set(gold ? 0xfacc15 : 0x4ade80);
          orbMesh.material.emissive.set(gold ? 0xcc9900 : 0x22cc55);
          orbLight.color.set(gold ? 0xfacc15 : 0x4ade80);
          orbLight.position.set(orbMesh.position.x, orbMesh.position.y, 36);
        } else {
          orbMesh.visible = false;
          orbLight.visible = false;
        }
      }

      // ---------- overlay: start / game-over panels ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        if (!S.started && !S.over) {
          octx.fillStyle = 'rgba(0,0,0,0.45)';
          octx.fillRect(0, 0, W, H);
          octx.fillStyle = '#f8fafc';
          octx.font = '700 22px system-ui';
          octx.textAlign = 'center';
          octx.fillText('TAP AN ARROW TO START', W / 2, H / 2);
        }
        if (S.over) {
          octx.fillStyle = 'rgba(0,0,0,0.5)';
          octx.fillRect(0, 0, W, H);
          octx.fillStyle = '#f8fafc';
          octx.font = '700 26px system-ui';
          octx.textAlign = 'center';
          octx.fillText('GAME OVER', W / 2, H / 2);
        }
      }

      let last = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dtMs = now - last;
        last = now;
        stepLogic(dtMs);
        syncScene(now);
        renderer.render(scene, camera);
        drawOverlay();
      };
      raf = requestAnimationFrame(frame);

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

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgSnake;
      };
    })();

    // controls: keys + swipe (on the stage)
    const key = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
      if (map[e.key]) {
        e.preventDefault();
        S.turn(map[e.key]);
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
      if (Math.hypot(dx, dy) < 24) return;
      S.turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
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
        window.__frgSnake?.turn(dir);
      }}
    >
      {label}
    </button>
  );

  return (
    <main style={{ maxWidth: 430, margin: '0 auto', padding: 12 }}>
      <h2 className="game-title">🐍 FRG SNAKE 3D</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>SCORE <b>{hud.score}</b></span>
        <span>LENGTH <b>{hud.len}</b></span>
      </div>
      <div
        ref={mountRef}
        style={{ position: 'relative', width: '100%', aspectRatio: '400 / 520', touchAction: 'none', borderRadius: 12, overflow: 'hidden' }}
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
        Orbs 25 · every 5th is golden, 60. Tiers: 150→5 · 300→10 · 500→15 ·
        750→22 · 1,050→32 · 1,400→45.
      </p>
    </main>
  );
}
