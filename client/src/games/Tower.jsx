import { useEffect, useRef } from 'react';

// FRG Tower — precision stacking, now in REAL 3D (Three.js). The drop
// logic is the original game verbatim — same slice math, perfect
// window, speed ramp, tiers and result contract (the server re-derives
// them exactly). Only the renderer changed: real 3D blocks on a plaza
// at sunset, a camera that climbs with the tower, and sliced pieces
// that tumble away in 3D.
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
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

    // Popup/particle coordinates are WORLD coordinates in this edition
    // (x = game x, y = height up the tower); the overlay projects them.
    const S = {
      score: 0,
      blocks: 0,
      over: false,
      stack: [{ x: 105, w: 190 }],
      cur: { x: -190, w: 190, dir: 1 },
      speed: 130,
      falling: [], // {x, y, w, vy, rot, topH}
      msg: 'Tap to drop the block!',
      msgAt: Date.now(),
      perfects: 0,
      particles: [],
      popups: [],
      camY: 0,
    };

    function say(m) { S.msg = m; S.msgAt = Date.now(); }
    const topH = () => S.stack.length * BLOCK_H;

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
        S.falling.push({ x: cur.x, y: 0, w: cur.w, vy: 60, rot: 0, topH: topH() });
        finish('Missed — the block fell!');
        return;
      }
      const perfect = Math.abs(cur.x - prev.x) <= 5;
      if (!perfect) {
        if (cur.x < left) S.falling.push({ x: cur.x, y: 0, w: left - cur.x, vy: 40, rot: -0.4, topH: topH() });
        if (cur.x + cur.w > right) S.falling.push({ x: right, y: 0, w: cur.x + cur.w - right, vy: 40, rot: 0.4, topH: topH() });
      }
      const placed = perfect ? { x: prev.x, w: prev.w } : { x: left, w: right - left };
      S.stack.push(placed);
      S.blocks += 1;
      if (perfect) {
        S.perfects += 1;
        S.score += 150;
        say(`🎯 PERFECT! +150 (${S.perfects} in this tower)`);
        S.popups.push({ x: placed.x + placed.w / 2, y: topH() + 30, text: 'PERFECT! +150', life: 1.1, color: '#ffd94d', size: 19 });
        for (let i = 0; i < 10; i++) {
          S.particles.push({ x: placed.x + Math.random() * placed.w, y: topH() + 2, vx: (Math.random() - 0.5) * 120, vy: 40 + Math.random() * 90, r: 1.8 + Math.random() * 2, life: 0.55, color: '#ffd94d' });
        }
      } else {
        S.score += 100;
        S.popups.push({ x: placed.x + placed.w / 2, y: topH() + 30, text: '+100', life: 0.9, color: '#ffffff', size: 15 });
        for (let i = 0; i < 4; i++) {
          S.particles.push({ x: placed.x + Math.random() * placed.w, y: topH() - 6, vx: (Math.random() - 0.5) * 70, vy: 20 + Math.random() * 40, r: 1.6 + Math.random() * 1.6, life: 0.4, color: '#cfe3ff' });
        }
      }
      if (placed.w < 14) { finish('Tower topped out — too thin to climb!'); return; }
      S.speed = Math.min(360, S.speed + 9);
      const fromLeft = S.blocks % 2 === 0;
      S.cur = { x: fromLeft ? -placed.w - 10 : W + 10, w: placed.w, dir: fromLeft ? 1 : -1 };
    }

    function stepLogic(dt) {
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
      S.falling = S.falling.filter((f) => f.y < 900);
      for (const pt of S.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy -= 320 * dt; pt.life -= dt; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y += 32 * dt; pu.life -= dt * 0.9; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
      const target = Math.max(0, topH() - 300);
      S.camY += (target - S.camY) * Math.min(1, dt * 5);
    }

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const mount = mountRef.current;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x191233);
      scene.fog = new THREE.Fog(0x191233, 1400, 3400);
      const camera = new THREE.PerspectiveCamera(46, W / H, 1, 6000);

      scene.add(new THREE.HemisphereLight(0xffd9a8, 0x241a4d, 1.75));
      const sun = new THREE.DirectionalLight(0xffc98a, 2.1);
      sun.position.set(-320, 520, 420);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x8fb7ff, 0.65);
      fill.position.set(300, 200, 500);
      scene.add(fill);

      // sunset backdrop (the club's tower art) that parallaxes as we climb
      let bgPlane;
      {
        const tex = new THREE.TextureLoader().load('/art/tower-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        bgPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(3400, 2150),
          new THREE.MeshBasicMaterial({ map: tex, fog: false })
        );
        bgPlane.position.set(200, 150, -760);
        scene.add(bgPlane);
      }
      // plaza ground + glowing ring around the tower base
      {
        const ground = new THREE.Mesh(
          new THREE.CircleGeometry(1500, 40),
          new THREE.MeshStandardMaterial({ color: 0x2e3d63, roughness: 0.95 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(200, -2, 0);
        scene.add(ground);
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(310, 5, 8, 48),
          new THREE.MeshBasicMaterial({ color: 0x38e0d4 })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(200, 1, 0);
        scene.add(ring);
      }
      // blocks — one unit box scaled per block (pool sized to a tall run)
      const blockGeo = new THREE.BoxGeometry(1, BLOCK_H - 2, 96);
      const mats = [
        new THREE.MeshStandardMaterial({ color: 0xd9a92f, roughness: 0.3, metalness: 0.55, emissive: 0xd9a92f, emissiveIntensity: 0.12 }),
        new THREE.MeshStandardMaterial({ color: 0x35548c, roughness: 0.34, metalness: 0.6, emissive: 0x35548c, emissiveIntensity: 0.12 }),
      ];
      const BLOCK_POOL = 160;
      const blockMeshes = [];
      for (let i = 0; i < BLOCK_POOL; i++) {
        const m = new THREE.Mesh(blockGeo, mats[i % 2]);
        m.visible = false;
        scene.add(m);
        blockMeshes.push(m);
      }
      const curMesh = new THREE.Mesh(blockGeo, mats[0]);
      scene.add(curMesh);
      const fallPool = [];
      for (let i = 0; i < 6; i++) {
        const m = new THREE.Mesh(blockGeo, mats[0]);
        m.visible = false;
        scene.add(m);
        fallPool.push(m);
      }
      // guide lines from the sliding block down to the tower top edges
      const guideMat = new THREE.MeshBasicMaterial({ color: 0xf5c542, transparent: true, opacity: 0.4 });
      const guideGeo = new THREE.BoxGeometry(2, 1, 2);
      const guideL = new THREE.Mesh(guideGeo, guideMat);
      const guideR = new THREE.Mesh(guideGeo, guideMat);
      scene.add(guideL, guideR);
      // particles
      const PMAX = 120;
      let partPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
        partPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }));
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

      const tmpV = new THREE.Vector3();
      function syncScene() {
        const camY = S.camY;
        camera.position.set(200, camY + 268, 478);
        camera.lookAt(200, camY + 92, 0);
        bgPlane.position.y = 150 + camY * 0.88;
        // stack blocks
        const n = S.stack.length;
        for (let i = 0; i < BLOCK_POOL; i++) {
          const m = blockMeshes[i];
          if (i >= n) { m.visible = false; continue; }
          const b = S.stack[i];
          m.visible = true;
          m.material = mats[i % 2];
          m.scale.x = Math.max(1, b.w);
          m.position.set(b.x + b.w / 2, i * BLOCK_H + BLOCK_H / 2, 0);
        }
        // sliding block + guides
        const slideY = topH() + 62;
        if (!S.over) {
          curMesh.visible = true;
          curMesh.material = mats[n % 2];
          curMesh.scale.x = Math.max(1, S.cur.w);
          curMesh.position.set(S.cur.x + S.cur.w / 2, slideY, 0);
          const prev = S.stack[n - 1];
          const gh = slideY - topH();
          for (const [mesh, gx] of [[guideL, prev.x], [guideR, prev.x + prev.w]]) {
            mesh.visible = true;
            mesh.scale.y = gh;
            mesh.position.set(gx, topH() + gh / 2, 0);
          }
        } else {
          curMesh.visible = false;
          guideL.visible = guideR.visible = false;
        }
        // falling sliced pieces tumble in 3D
        fallPool.forEach((m, i) => {
          const f = S.falling[i];
          if (!f) { m.visible = false; return; }
          m.visible = true;
          m.scale.x = Math.max(1, f.w);
          m.position.set(f.x + f.w / 2, f.topH + BLOCK_H + 62 - f.y, 0);
          m.rotation.z = f.rot * Math.min(1, f.y / 120);
          m.rotation.x = f.y / 260;
        });
        // particles
        {
          const posA = partPts.geometry.getAttribute('position');
          const colA = partPts.geometry.getAttribute('color');
          for (let i = 0; i < PMAX; i++) {
            const pt = S.particles[i];
            if (!pt) { posA.setXYZ(i, -200, -200, -200); continue; }
            posA.setXYZ(i, pt.x, pt.y, 56);
            const c = rgb(pt.color);
            colA.setXYZ(i, c[0], c[1], c[2]);
          }
          posA.needsUpdate = true;
          colA.needsUpdate = true;
        }
      }

      // ---------- overlay: popups (projected) + game-over panel ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        for (const pu of S.popups) {
          tmpV.set(pu.x, pu.y, 40).project(camera);
          const px = (tmpV.x * 0.5 + 0.5) * W;
          const py = (-tmpV.y * 0.5 + 0.5) * H;
          octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
          octx.font = `900 ${pu.size}px system-ui`;
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(20,8,40,0.85)';
          octx.lineWidth = 4;
          octx.strokeText(pu.text, px, py);
          octx.fillStyle = pu.color;
          octx.fillText(pu.text, px, py);
        }
        octx.globalAlpha = 1;
        if (S.over) {
          octx.fillStyle = 'rgba(4,8,16,0.62)';
          octx.fillRect(0, 0, W, H);
          octx.fillStyle = '#fff';
          octx.font = 'bold 25px system-ui';
          octx.textAlign = 'center';
          octx.fillText('TOWER DOWN', W / 2, H / 2 - 6);
          octx.font = '15px system-ui';
          octx.fillStyle = '#f5c542';
          octx.fillText(`${S.blocks} blocks · ${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
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

      let last = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        stepLogic(dt);
        syncScene();
        renderer.render(scene, camera);
        drawOverlay();
      };
      raf = requestAnimationFrame(frame);

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

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgTower;
      };
    })();

    function onDown(e) {
      e.preventDefault();
      drop();
    }
    function onKey(e) {
      if (e.code === 'Space') { e.preventDefault(); drop(); }
    }
    const mountEl = mountRef.current;
    if (mountEl) mountEl.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    return () => {
      disposed = true;
      cleanup3d();
      if (mountEl) mountEl.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">🏗️ FRG TOWER 3D</h2>
      <div className="pb-hud">
        <div>SCORE <b id="tw-score">0</b></div>
        <div>BLOCKS <b id="tw-blocks">0</b></div>
        <div className="pb-next" id="tw-next">NEXT: 5 PTS @ 800</div>
      </div>
      <div
        ref={mountRef}
        style={{ position: 'relative', width: '100%', maxWidth: W, aspectRatio: '400 / 520', margin: '0 auto', touchAction: 'none', borderRadius: 12, overflow: 'hidden' }}
      >
        <canvas
          ref={overlayRef}
          width={W}
          height={H}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
        />
      </div>
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
