import { useEffect, useRef } from 'react';
import { createRenderer } from './gl.js';

// FRG Slice — gems arc up the screen; swipe through them to slice.
// Now in REAL 3D (Three.js): faceted 3D gems, gold coins, pink jewels
// and spiky black bombs tumble through the dojo as real objects, and
// a sliced item splits into two tumbling 3D halves. Gold gems +50,
// coins +25, the rare jewel +100; slicing 3+ in one swipe pays a
// combo bonus. Slice a bomb or let three good items fall past you
// and the run ends. Score converts by tiers (the server re-derives
// them exactly). All physics, spawning and scoring are the original.
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
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};
    let nextId = 1;
    const S = {
      score: 0,
      lives: 3,
      over: false,
      slicedCount: 0,
      particles: [],
      popups: [],
      lastSlice: null,
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
        for (let i = 0; i < 16; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 150;
          S.particles.push({ x: it.x, y: it.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: 2.4 + Math.random() * 2.4, life: 0.55, color: i % 2 ? '#ff7a2a' : '#ffb347' });
        }
        loseLife('💣 Bomb sliced!');
        return;
      }
      S.score += PTS[it.type];
      S.slicedCount += 1;
      S.strokeSlices += 1;
      S.lastSlice = { x: it.x, y: it.y };
      S.popups.push({ x: it.x, y: it.y - 14, text: `+${PTS[it.type]}`, life: 1, color: '#ffffff', size: 16 });
      const pc = it.type === 'gem' ? '#2ee66b' : it.type === 'jewel' ? '#ff5da2' : '#ffd94d';
      for (let i = 0; i < 7; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 90;
        S.particles.push({ x: it.x, y: it.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: 1.8 + Math.random() * 1.8, life: 0.45, color: pc });
      }
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
        const at = S.lastSlice || { x: W / 2, y: 150 };
        S.popups.push({ x: at.x, y: at.y - 44, text: `COMBO +${bonus}`, life: 1.15, color: '#ffd94d', size: 20 });
      }
      S.strokeSlices = 0;
    }

    function finish() {
      if (S.over) return;
      S.over = true;
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onFinish({
          outcome: sliceAmount(S.score) > 0 ? 'win' : 'lose',
          score: S.score,
          amount: sliceAmount(S.score),
          sliced: S.slicedCount,
          durationMs: Date.now() - start,
        });
      }, 1000);
    }

    function step(now, lastRef) {
      const dt = Math.min(0.033, (now - lastRef.v) / 1000);
      lastRef.v = now;
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
      for (const pt of S.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 300 * dt; pt.life -= dt; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y -= 36 * dt; pu.life -= dt * 0.95; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
      for (const h of S.halves) {
        h.vy += GRAV * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
        h.life -= dt;
      }
      S.halves = S.halves.filter((h) => h.life > 0);
      S.shake = Math.max(0, S.shake - dt);
    }

    const el = {
      score: () => document.getElementById('sl-score'),
      lives: () => document.getElementById('sl-lives'),
      next: () => document.getElementById('sl-next'),
      msg: () => document.getElementById('sl-msg'),
    };
    function dom() {
      const sc = el.score();
      if (sc) sc.textContent = S.score.toLocaleString();
      const lv = el.lives();
      if (lv) lv.textContent = '❤️'.repeat(Math.max(0, S.lives)) || '—';
      const nxt = SLICE_TIERS.filter((t) => S.score < t.min).pop();
      const nx = el.next();
      if (nx) {
        const amt = sliceAmount(S.score);
        nx.textContent = S.over
          ? amt > 0 ? `PAYS ${amt} PTS` : 'NO PAYOUT'
          : nxt ? `NEXT: ${nxt.amount} PTS @ ${nxt.min.toLocaleString()}` : 'MAX TIER!';
      }
      const ms = el.msg();
      if (ms) ms.textContent = Date.now() - S.msgAt < 2400 ? S.msg : '';
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
      scene.background = new THREE.Color(0x0a1122);
      scene.fog = new THREE.Fog(0x0a1122, 1100, 2600);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(200, 278, 645);
      camera.lookAt(200, 256, 0);

      scene.add(new THREE.HemisphereLight(0xd8ecff, 0x1a2436, 1.55));
      const sun = new THREE.DirectionalLight(0xfff2cf, 2.1);
      sun.position.set(160, 420, 520);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fd0ff, 0.55);
      fill.position.set(-240, 120, 260);
      scene.add(fill);

      const wy = (gy) => H - gy;
      {
        const tex = new THREE.TextureLoader().load('/art/slice-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(1020, 1330),
          new THREE.MeshBasicMaterial({ map: tex, fog: false, color: 0x878da3 })
        );
        bg.position.set(200, 260, -215);
        scene.add(bg);
      }
      // ---- item factories (real 3D objects) ----
      function makeItemMesh(type) {
        const g = new THREE.Group();
        if (type === 'gem' || type === 'jewel') {
          const isJewel = type === 'jewel';
          const m = new THREE.Mesh(
            new THREE.OctahedronGeometry(isJewel ? 20 : 22, 0),
            new THREE.MeshStandardMaterial({
              color: isJewel ? 0xff5da2 : 0x2ee66b,
              roughness: 0.12, metalness: 0.1,
              emissive: isJewel ? 0xff5da2 : 0x2ee66b, emissiveIntensity: 0.38,
              flatShading: true,
            })
          );
          m.scale.y = 1.3;
          g.add(m);
        } else if (type === 'coin') {
          const geo = new THREE.CylinderGeometry(16, 16, 6, 22);
          geo.rotateX(Math.PI / 2);
          const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffd94d, roughness: 0.22, metalness: 0.75, emissive: 0xffd94d, emissiveIntensity: 0.18 }));
          g.add(m);
        } else if (type === 'bomb') {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(18, 16, 12),
            new THREE.MeshStandardMaterial({ color: 0x1c2433, roughness: 0.35, metalness: 0.4 })
          );
          g.add(m);
          const fuse = new THREE.Mesh(
            new THREE.CylinderGeometry(2.2, 2.2, 12, 6),
            new THREE.MeshStandardMaterial({ color: 0x8a6d3b, roughness: 0.8 })
          );
          fuse.position.set(4, 19, 0);
          fuse.rotation.z = -0.5;
          g.add(fuse);
          const spark = new THREE.Mesh(
            new THREE.SphereGeometry(3.6, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffb347 })
          );
          spark.position.set(8.5, 25, 0);
          spark.name = 'spark';
          g.add(spark);
        }
        scene.add(g);
        return g;
      }
      const itemMeshes = new Map(); // id -> group
      const halfMeshes = []; // parallel to S.halves via index tagging
      function getItemMesh(it) {
        let m = itemMeshes.get(it.id);
        if (!m) {
          m = makeItemMesh(it.type);
          itemMeshes.set(it.id, m);
        }
        return m;
      }
      function makeHalfMesh(type) {
        const g = makeItemMesh(type === 'boom' ? 'bomb' : type);
        g.scale.set(0.92, 0.5, 0.92);
        return g;
      }
      // blade trail: glowing line + soft points
      let bladeLine;
      let bladePts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
        bladeLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xaee9ff, transparent: true, opacity: 0.9 }));
        bladeLine.frustumCulled = false;
        scene.add(bladeLine);
        bladePts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdff6ff, size: 9, sizeAttenuation: false, transparent: true, opacity: 0.45 }));
        bladePts.frustumCulled = false;
        scene.add(bladePts);
      }
      // particles
      let partPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(320 * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(320 * 3), 3));
        partPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 5.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }));
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

      function syncScene(now) {
        // camera shake on life loss (the 2D version shook the canvas)
        if (S.shake > 0) {
          camera.position.x = 200 + (Math.random() - 0.5) * 9 * S.shake;
          camera.position.y = 278 + (Math.random() - 0.5) * 9 * S.shake;
        } else {
          camera.position.x = 200;
          camera.position.y = 278;
        }
        camera.lookAt(200, 256, 0);
        const seen = new Set();
        for (const it of S.items) {
          if (it.sliced) continue;
          seen.add(it.id);
          const m = getItemMesh(it);
          m.position.set(it.x, wy(it.y), 0);
          m.rotation.z = it.rot;
          m.rotation.x = it.rot * 0.7;
          const spark = m.getObjectByName('spark');
          if (spark) {
            const f = 0.8 + Math.random() * 0.6;
            spark.scale.set(f, f, f);
          }
        }
        for (const [id, m] of itemMeshes) {
          if (!seen.has(id)) {
            scene.remove(m);
            itemMeshes.delete(id);
          }
        }
        // halves
        while (halfMeshes.length < S.halves.length) halfMeshes.push(null);
        S.halves.forEach((h, i) => {
          if (h.type === 'boom') return;
          if (halfMeshes[i] && halfMeshes[i].userData.halfType !== h.type) {
            scene.remove(halfMeshes[i]);
            halfMeshes[i] = null;
          }
          if (!halfMeshes[i]) {
            halfMeshes[i] = makeHalfMesh(h.type);
            halfMeshes[i].userData.halfType = h.type;
          }
          const m = halfMeshes[i];
          m.position.set(h.x, wy(h.y), 0);
          m.rotation.z = h.rot;
          m.rotation.x = h.rot * 0.8;
          m.traverse((o) => {
            if (o.material && o.material.transparent !== true) {
              o.material = o.material.clone();
              o.material.transparent = true;
            }
            if (o.material) o.material.opacity = Math.max(0, Math.min(1, h.life * 1.6));
          });
        });
        for (let i = S.halves.length; i < halfMeshes.length; i++) {
          if (halfMeshes[i]) scene.remove(halfMeshes[i]);
        }
        halfMeshes.length = S.halves.length;
        // blade
        {
          const arr = bladeLine.geometry.getAttribute('position');
          const pts = S.trail.slice(-24);
          for (let i = 0; i < 24; i++) {
            const p = pts[i];
            if (!p) { arr.setXYZ(i, -300, -300, -300); continue; }
            arr.setXYZ(i, p.x, wy(p.y), 26);
          }
          bladeLine.geometry.setDrawRange(0, pts.length);
          bladePts.geometry.setDrawRange(0, pts.length);
          arr.needsUpdate = true;
        }
        // particles
        {
          const posA = partPts.geometry.getAttribute('position');
          const colA = partPts.geometry.getAttribute('color');
          for (let i = 0; i < 320; i++) {
            const pt = S.particles[i];
            if (!pt) { posA.setXYZ(i, -300, -300, -300); continue; }
            posA.setXYZ(i, pt.x, wy(pt.y), 16);
            const c = rgb(pt.color);
            colA.setXYZ(i, c[0], c[1], c[2]);
          }
          posA.needsUpdate = true;
          colA.needsUpdate = true;
        }
      }

      // ---------- overlay: popups + game-over panel (game coords) ----
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        for (const pu of S.popups) {
          octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
          octx.font = `900 ${pu.size}px system-ui`;
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(10,10,26,0.85)';
          octx.lineWidth = 4;
          octx.strokeText(pu.text, pu.x, pu.y);
          octx.fillStyle = pu.color;
          octx.fillText(pu.text, pu.x, pu.y);
        }
        octx.globalAlpha = 1;
        // bomb flash glyph at fresh boom halves
        for (const h of S.halves) {
          if (h.type !== 'boom') continue;
          octx.font = '30px system-ui';
          octx.textAlign = 'center';
          octx.fillText('💥', h.x, h.y + 10);
        }
        if (S.over) {
          octx.fillStyle = 'rgba(4,8,16,0.7)';
          octx.fillRect(0, 0, W, H);
          octx.fillStyle = '#fff';
          octx.font = 'bold 25px system-ui';
          octx.textAlign = 'center';
          octx.fillText('TIME UP ON LIVES', W / 2, H / 2 - 6);
          octx.font = '15px system-ui';
          octx.fillStyle = '#f5c542';
          octx.fillText(`${S.slicedCount} sliced · ${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
        }
      }

      const lastRef = { v: performance.now() };
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        step(now, lastRef);
        syncScene(now);
        renderer.render(scene, camera);
        drawOverlay();
        dom();
      };
      raf = requestAnimationFrame(frame);

      window.__frgSlice = {
        state: () => ({
          score: S.score, lives: S.lives, over: S.over, sliced: S.slicedCount,
          items: S.items.filter((i) => !i.sliced).map((i) => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), vy: Math.round(i.vy), type: i.type })),
        }),
        swipe: (x1, y1, x2, y2) => { S.strokeSlices = 0; bladeSweep(x1, y1, x2, y2); endStroke(); },
      };

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgSlice;
      };
    })();

    // pointer input on the mount (same slingshot trail math as 2D)
    const mountEl = mountRef.current;
    function toLocal(e) {
      const rect = mountEl.getBoundingClientRect();
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
    if (mountEl) {
      mountEl.addEventListener('pointerdown', onDown);
      mountEl.addEventListener('pointermove', onMove);
    }
    window.addEventListener('pointerup', onUp);

    return () => {
      disposed = true;
      cleanup3d();
      if (mountEl) {
        mountEl.removeEventListener('pointerdown', onDown);
        mountEl.removeEventListener('pointermove', onMove);
      }
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="game-wrap pinball-wrap">
      <h2 className="game-title">⚔️ FRG SLICE 3D</h2>
      <div className="pb-hud">
        <div>SCORE <b id="sl-score">0</b></div>
        <div><b id="sl-lives">❤️❤️❤️</b></div>
        <div className="pb-next" id="sl-next">NEXT: 5 PTS @ 600</div>
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
      <p style={{ textAlign: 'center', minHeight: 22 }} id="sl-msg"></p>
      <p className="fineprint">
        Gems 50 · coins 25 · jewels 100 — combos pay +25 per extra slice.
        Tiers: 600→5 · 1,100→10 · 1,700→15 · 2,500→22 · 3,500→32 · 5,000→45.
      </p>
    </div>
  );
}
