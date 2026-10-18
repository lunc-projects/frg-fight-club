import { useEffect, useRef } from 'react';
import { createRenderer } from './gl.js';

// FRG Flight — one-tap rocket flying, now in REAL 3D (Three.js). The
// run logic is the original game verbatim — same gravity, gaps, coins,
// tiers and result contract (the server re-derives them exactly). Only
// the renderer changed: the rocket is a real 3D model, the gates are
// metal columns with gold caps standing in space, coins spin in 3D,
// and the backdrop is the club's sky art on a scrolling plane.
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
  const mountRef = useRef(null);
  const overlayRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const start = Date.now();
    let disposed = false;
    let raf = 0;
    let cleanup3d = () => {};

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
      particles: [],
      popups: [],
      callout: null,
      trailAcc: 0,
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
      setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onFinish({
          outcome: flightAmount(S.score) > 0 ? 'win' : 'lose',
          score: S.score,
          amount: flightAmount(S.score),
          gates: S.gates,
          durationMs: Date.now() - start,
        });
      }, 900);
    }

    function stepLogic(now, dt) {
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
            S.popups.push({ x: RX + 18, y: S.y - 26, text: '+100', life: 1, color: '#ffffff' });
            if (S.gates % 5 === 0) {
              say(`🚀 ${S.gates} gates!`);
              S.callout = { text: `${S.gates} GATES! 🚀`, at: Date.now() };
            }
          }
          if (p.coin && !p.coinTaken && Math.abs(p.x + GATE_W / 2 - RX) < 22 && Math.abs(p.cy - S.y) < 22) {
            p.coinTaken = true;
            S.score += 25;
            S.popups.push({ x: p.x + GATE_W / 2, y: p.cy - 18, text: '+25', life: 1, color: '#ffd94d' });
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              S.particles.push({ x: p.x + GATE_W / 2, y: p.cy, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, r: 2.2, life: 0.4, gold: true });
            }
          }
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
        S.trailAcc += dt;
        while (S.trailAcc > 0.016) {
          S.trailAcc -= 0.016;
          S.particles.push({ x: RX - 34, y: S.y + (Math.random() * 10 - 5), vx: -60 - Math.random() * 40, vy: (Math.random() - 0.5) * 20, r: 2 + Math.random() * 3, life: 0.55, gold: false });
        }
      }
      for (const pt of S.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
      S.particles = S.particles.filter((pt) => pt.life > 0);
      for (const pu of S.popups) { pu.y -= 34 * dt; pu.life -= dt * 0.9; }
      S.popups = S.popups.filter((pu) => pu.life > 0);
      if (S.callout && Date.now() - S.callout.at > 950) S.callout = null;
      S.flame = Math.max(0, S.flame - dt * 5);
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
      scene.fog = new THREE.Fog(0x0a1122, 900, 2400);
      const camera = new THREE.PerspectiveCamera(50, W / H, 1, 4000);
      camera.position.set(168, 292, 668);
      camera.lookAt(214, 252, 0);

      scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x1a1030, 1.55));
      const sun = new THREE.DirectionalLight(0xfff1cf, 2.0);
      sun.position.set(220, 480, 520);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fb2ff, 0.7);
      fill.position.set(-260, 140, 300);
      scene.add(fill);

      const wy = (gy) => H - gy;

      // scrolling sky backdrop (the club's flight art on a far plane)
      {
        const tex = new THREE.TextureLoader().load('/art/flight-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.set(1.73, 1);
        });
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(1600, 620),
          new THREE.MeshBasicMaterial({ map: tex, fog: false })
        );
        bg.position.set(200, 260, -300);
        scene.add(bg);
        scene.userData.bgTex = tex;
      }
      // stars
      let starPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
        starPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdce9ff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0.8 }));
        scene.add(starPts);
      }
      // ground platform + glowing front edge
      {
        const ground = new THREE.Mesh(
          new THREE.BoxGeometry(430, 8, 170),
          new THREE.MeshStandardMaterial({ color: 0x1b2c4f, roughness: 0.85 })
        );
        ground.position.set(200, 2, 30);
        scene.add(ground);
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(430, 2.5, 3),
          new THREE.MeshBasicMaterial({ color: 0x38e0d4 })
        );
        edge.position.set(200, 6.5, 113);
        scene.add(edge);
      }
      // gate columns + caps (pooled pairs)
      const colMat = new THREE.MeshStandardMaterial({ color: 0x3d5c8f, roughness: 0.34, metalness: 0.72 });
      const capMat = new THREE.MeshStandardMaterial({ color: 0xf5c542, roughness: 0.3, metalness: 0.6, emissive: 0x664d00, emissiveIntensity: 0.5 });
      const colGeo = new THREE.BoxGeometry(GATE_W, 1, 118);
      const capGeo = new THREE.BoxGeometry(GATE_W + 8, 13, 136);
      const gatePool = [];
      for (let i = 0; i < 5; i++) {
        const top = new THREE.Mesh(colGeo, colMat);
        const bot = new THREE.Mesh(colGeo, colMat);
        const capT = new THREE.Mesh(capGeo, capMat);
        const capB = new THREE.Mesh(capGeo, capMat);
        scene.add(top, bot, capT, capB);
        gatePool.push({ top, bot, capT, capB });
      }
      // coins (pooled, spinning)
      const coinGeo = new THREE.CylinderGeometry(11.5, 11.5, 3.6, 22);
      coinGeo.rotateX(Math.PI / 2);
      const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc93c, emissive: 0x8a5c00, emissiveIntensity: 0.8, roughness: 0.25, metalness: 0.9 });
      const coinPool = [];
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(coinGeo, coinMat);
        m.visible = false;
        scene.add(m);
        coinPool.push(m);
      }
      // the rocket — a real little 3D ship
      const rocket = new THREE.Group();
      const rocketParts = (() => {
        const paint = new THREE.MeshStandardMaterial({ color: 0xf7b733, roughness: 0.34, metalness: 0.5, emissive: 0xf7b733, emissiveIntensity: 0.13 });
        const red = new THREE.MeshStandardMaterial({ color: 0xe5534b, roughness: 0.5, metalness: 0.2 });
        const bodyGeo = new THREE.CylinderGeometry(10.5, 12.5, 40, 18);
        bodyGeo.rotateZ(Math.PI / 2);
        const body = new THREE.Mesh(bodyGeo, paint);
        const noseGeo = new THREE.ConeGeometry(10.5, 16, 18);
        noseGeo.rotateZ(-Math.PI / 2);
        const nose = new THREE.Mesh(noseGeo, red);
        nose.position.x = 28;
        const finGeo = new THREE.BoxGeometry(13, 15, 2.6);
        const finT = new THREE.Mesh(finGeo, red);
        finT.position.set(-18, 11, 0);
        finT.rotation.z = 0.5;
        const finB = new THREE.Mesh(finGeo, red);
        finB.position.set(-18, -11, 0);
        finB.rotation.z = -0.5;
        const win = new THREE.Mesh(
          new THREE.SphereGeometry(5.4, 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xbfe3ff, roughness: 0.1, metalness: 0.3, emissive: 0x86c5ff, emissiveIntensity: 0.5 })
        );
        win.position.set(7, 6.5, 8.5);
        const flameGeo = new THREE.ConeGeometry(6.4, 26, 12);
        flameGeo.rotateZ(Math.PI / 2);
        const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff8c3a, transparent: true, opacity: 0.92 }));
        flame.position.x = -33;
        const lamp = new THREE.PointLight(0xffa04a, 1.1, 260, 0);
        lamp.position.set(-24, 0, 26);
        rocket.add(body, nose, finT, finB, win, flame, lamp);
        scene.add(rocket);
        return { flame };
      })();
      // particles (one Points cloud, vertex colors)
      const PMAX = 260;
      let partPts;
      {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(PMAX * 3), 3));
        partPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 4.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 }));
        partPts.frustumCulled = false;
        scene.add(partPts);
      }

      function syncScene(now) {
        // backdrop scroll
        const tex = scene.userData.bgTex;
        if (tex && tex.image) tex.offset.x = -((S.scroll * 0.35) % 924) / 924;
        // stars
        {
          const arr = starPts.geometry.getAttribute('position');
          S.stars.forEach((st, i) => arr.setXYZ(i, st.x, wy(st.y), -140));
          arr.needsUpdate = true;
        }
        // gates
        gatePool.forEach((gset, i) => {
          const p = S.pillars[i];
          if (!p) { gset.top.visible = gset.bot.visible = gset.capT.visible = gset.capB.visible = false; return; }
          const topH = p.cy - GAP / 2;
          const botY = p.cy + GAP / 2;
          const cx = p.x + GATE_W / 2;
          gset.top.visible = gset.bot.visible = gset.capT.visible = gset.capB.visible = true;
          gset.top.scale.y = Math.max(1, topH);
          gset.top.position.set(cx, wy(topH / 2), 0);
          gset.bot.scale.y = Math.max(1, H - botY);
          gset.bot.position.set(cx, wy(botY + (H - botY) / 2), 0);
          gset.capT.position.set(cx, wy(topH) + 6, 0);
          gset.capB.position.set(cx, wy(botY) - 6, 0);
        });
        // coins
        coinPool.forEach((m, i) => {
          const p = S.pillars[i];
          if (!p || !p.coin || p.coinTaken) { m.visible = false; return; }
          m.visible = true;
          m.position.set(p.x + GATE_W / 2, wy(p.cy), 4);
          m.rotation.y = now / 240 + i;
        });
        // rocket
        rocket.position.set(RX, wy(S.y), 10);
        rocket.rotation.z = -Math.max(-0.5, Math.min(0.9, S.vy / 700));
        rocketParts.flame.visible = S.flame > 0 || (S.started && !S.over);
        rocketParts.flame.scale.set(0.8 + Math.random() * 0.55 + S.flame * 0.5, 1, 1);
        // particles
        {
          const posA = partPts.geometry.getAttribute('position');
          const colA = partPts.geometry.getAttribute('color');
          for (let i = 0; i < PMAX; i++) {
            const pt = S.particles[i];
            if (!pt) { posA.setXYZ(i, -100, -100, -100); continue; }
            posA.setXYZ(i, pt.x, wy(pt.y), 12);
            if (pt.gold) colA.setXYZ(i, 1, 0.85, 0.3);
            else colA.setXYZ(i, 0.85, 0.92, 1);
          }
          posA.needsUpdate = true;
          colA.needsUpdate = true;
        }
      }

      // ---------- overlay: text juice in the old 2D coordinates ----------
      const overlay = overlayRef.current;
      const octx = overlay.getContext('2d');
      function drawOverlay() {
        octx.clearRect(0, 0, W, H);
        for (const pu of S.popups) {
          octx.globalAlpha = Math.max(0, Math.min(1, pu.life));
          octx.fillStyle = pu.color;
          octx.font = '900 17px system-ui';
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(6,20,40,0.8)';
          octx.lineWidth = 3;
          octx.strokeText(pu.text, pu.x, pu.y);
          octx.fillText(pu.text, pu.x, pu.y);
        }
        octx.globalAlpha = 1;
        if (S.callout) {
          const age = Date.now() - S.callout.at;
          const sc = age < 220 ? 0.6 + (age / 220) * 0.55 : 1.15;
          octx.save();
          octx.translate(W / 2, 150);
          octx.scale(sc, sc);
          octx.globalAlpha = age > 700 ? Math.max(0, 1 - (age - 700) / 250) : 1;
          octx.font = '900 30px system-ui';
          octx.textAlign = 'center';
          octx.strokeStyle = 'rgba(6,20,40,0.85)';
          octx.lineWidth = 6;
          octx.strokeText(S.callout.text, 0, 0);
          octx.fillStyle = '#ffd94d';
          octx.fillText(S.callout.text, 0, 0);
          octx.restore();
          octx.globalAlpha = 1;
        }
        if (!S.started && !S.over) {
          octx.fillStyle = 'rgba(255,255,255,0.9)';
          octx.font = 'bold 19px system-ui';
          octx.textAlign = 'center';
          octx.fillText('TAP TO FLAP', W / 2, H / 2 - 90);
        }
        if (S.over) {
          octx.fillStyle = 'rgba(4,8,16,0.66)';
          octx.fillRect(0, 0, W, H);
          octx.fillStyle = '#fff';
          octx.font = 'bold 26px system-ui';
          octx.textAlign = 'center';
          octx.fillText('CRASHED', W / 2, H / 2 - 8);
          octx.font = '15px system-ui';
          octx.fillStyle = '#f5c542';
          octx.fillText(`${S.gates} gates · ${S.score.toLocaleString()} points`, W / 2, H / 2 + 20);
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

      let last = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.033, (now - last) / 1000);
        last = now;
        stepLogic(now, dt);
        syncScene(now);
        renderer.render(scene, camera);
        drawOverlay();
      };
      raf = requestAnimationFrame(frame);

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

      cleanup3d = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        delete window.__frgFlight;
      };
    })();

    function onDown(e) {
      e.preventDefault();
      flap();
    }
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }
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
      <h2 className="game-title">🚀 FRG FLIGHT 3D</h2>
      <div className="pb-hud">
        <div>SCORE <b id="fl-score">0</b></div>
        <div>GATES <b id="fl-gates">0</b></div>
        <div className="pb-next" id="fl-next">NEXT: 5 PTS @ 500</div>
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
