import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// FRG Rocket Crash — ride the multiplier, bail before it blows. Now in
// REAL 3D: a golden rocket climbs a glowing trail over the night city
// skyline, and the trail is the multiplier curve itself.
//
// Treasury-safe tuning (same rule as the wheel): the crash curve is
// P(reach t) = 0.65 / t at every target, so the expected payout is
// ~6.5 PTS on the 10 PTS entry no matter when the player bails — the
// treasury keeps ~3.5 PTS per launch on average. Max cash-out is 5.00x
// (50 PTS), which also keeps a single win inside the treasury float.
// These constants mirror the server's claim checks in server/index.js.
export const CRASH_GROWTH = 0.14; // multiplier = e^(0.14 * seconds)
export const CRASH_MIN_CASH = 1.1;
export const CRASH_MAX_MULT = 5.0;
const BUST_CHANCE = 0.04;
const CURVE_K = 0.677; // 0.96 * 0.677 ≈ 0.65 return factor

function drawCrashPoint() {
  if (Math.random() < BUST_CHANCE) return 1.0;
  return Math.min(CURVE_K / (1 - Math.random()), 50);
}

const fmt = (m) => `${m.toFixed(2)}×`;

// ---------------------------------------------------------------------
// The 3D stage. Reads a live mirror of the game state every frame and
// draws the rocket + trail; owns no game logic. Trail geometry mirrors
// the old SVG mapping: x = elapsed 0..16s, y = log scale to 5x.
// ---------------------------------------------------------------------
function CrashStage3D({ liveRef }) {
  const mountRef = useRef(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed) return;
      const mount = mountRef.current;
      const W = 400;
      const H = 300;
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x070d24);
      const camera = new THREE.PerspectiveCamera(52, W / H, 1, 3000);
      camera.position.set(200, 175, 460);
      camera.lookAt(200, 165, 0);

      scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x101a30, 1.6));
      const moon = new THREE.DirectionalLight(0xdfeaff, 1.4);
      moon.position.set(-140, 320, 360);
      scene.add(moon);

      // stars
      {
        const N = 130;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          pos[i * 3] = -160 + Math.random() * 720;
          pos[i * 3 + 1] = 60 + Math.random() * 360;
          pos[i * 3 + 2] = -260 - Math.random() * 160;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe6ff, size: 2.4, sizeAttenuation: false }));
        scene.add(stars);
      }
      // city skyline silhouette with lit windows
      {
        const city = new THREE.Group();
        const bMat = new THREE.MeshStandardMaterial({ color: 0x0d1830, roughness: 0.9 });
        let x = -180;
        while (x < 620) {
          const bw = 34 + Math.random() * 42;
          const bh = 30 + Math.random() * 74;
          const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 8), bMat);
          b.position.set(x + bw / 2, bh / 2 - 6, -150);
          city.add(b);
          x += bw + 5 + Math.random() * 12;
        }
        scene.add(city);
        const tex = new THREE.TextureLoader().load('/art/crash-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(1050, 560),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55 })
        );
        bg.position.set(200, 210, -320);
        scene.add(bg);
        // launch pad glow strip
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(860, 4, 10),
          new THREE.MeshBasicMaterial({ color: 0x1d3a2a })
        );
        pad.position.set(200, -4, -60);
        scene.add(pad);
      }
      // the rocket (nose up; tilted along the curve while flying)
      const rocket = new THREE.Group();
      {
        const gold = new THREE.MeshStandardMaterial({ color: 0xf7b733, roughness: 0.25, metalness: 0.65, emissive: 0xf7b733, emissiveIntensity: 0.22 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 44, 14), gold);
        rocket.add(body);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(9, 20, 14), new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.35, metalness: 0.3 }));
        nose.position.y = 31;
        rocket.add(nose);
        const win = new THREE.Mesh(new THREE.SphereGeometry(4.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xbfe8ff }));
        win.position.set(0, 10, 9.5);
        rocket.add(win);
        const finMat = new THREE.MeshStandardMaterial({ color: 0xe23b3b, roughness: 0.4 });
        for (const s of [-1, 1]) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(14, 16, 3), finMat);
          fin.position.set(s * 13, -20, 0);
          rocket.add(fin);
        }
        const flameGeo = new THREE.ConeGeometry(6.4, 26, 10);
        flameGeo.rotateX(Math.PI);
        const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.95 }));
        flame.position.set(0, -32, 0);
        rocket.add(flame);
        rocket.userData.flame = flame;
        const glow = new THREE.PointLight(0xffb84d, 60, 190);
        glow.position.set(0, -16, 14);
        rocket.add(glow);
        scene.add(rocket);
      }
      // trail line (own smooth buffer, appended while flying)
      const MAXP = 420;
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
      const trailMat = new THREE.LineBasicMaterial({ color: 0x4ade80 });
      const trail = new THREE.Line(trailGeo, trailMat);
      trail.frustumCulled = false;
      scene.add(trail);
      const trailPts = new THREE.Points(trailGeo, new THREE.PointsMaterial({ color: 0x4ade80, size: 5, sizeAttenuation: false, transparent: true, opacity: 0.85 }));
      trailPts.frustumCulled = false;
      scene.add(trailPts);
      trailMat.color.set(0x4ade80);
      let trailCount = 0;
      let lastPhase = 'count';
      // explosion burst
      const boomGeo = new THREE.BufferGeometry();
      boomGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(90 * 3), 3));
      const boom = new THREE.Points(boomGeo, new THREE.PointsMaterial({ color: 0xffa53c, size: 7, sizeAttenuation: false, transparent: true, opacity: 0 }));
      boom.frustumCulled = false;
      scene.add(boom);
      let boomAt = 0;
      const boomOrigin = new THREE.Vector3();

      const mapX = (t) => -70 + Math.min(1, t / 16) * 540;
      const mapY = (m) => 6 + (Math.log(Math.max(1, m)) / Math.log(CRASH_MAX_MULT)) * 268;

      function sync(now) {
        const L = liveRef.current;
        if (L.phase !== lastPhase) {
          if (L.phase === 'fly') {
            trailCount = 0;
            boom.material.opacity = 0;
            rocket.visible = true;
          }
          if (L.phase === 'crashed') {
            boomAt = now;
            boomOrigin.copy(rocket.position);
            rocket.visible = false;
            trailMat.color.set(0xef4444); trailPts.material.color.set(0xef4444);
            const arr = boom.geometry.getAttribute('position');
            for (let i = 0; i < 90; i++) arr.setXYZ(i, boomOrigin.x, boomOrigin.y, boomOrigin.z);
            arr.needsUpdate = true;
          }
          if (L.phase === 'cashed') { trailMat.color.set(0x4ade80); trailPts.material.color.set(0x4ade80); }
          if (L.phase === 'fly') { trailMat.color.set(0x4ade80); trailPts.material.color.set(0x4ade80); }
          lastPhase = L.phase;
        }
        if (L.phase === 'count') {
          rocket.position.set(mapX(0), mapY(1) + 26, 0);
          rocket.rotation.z = 0;
        }
        if (L.phase === 'fly' || L.phase === 'cashed' || L.phase === 'crashed') {
          const elapsed = L.flyStart ? (Date.now() - L.flyStart) / 1000 : 0;
          const m = L.phase === 'fly' ? Math.exp(CRASH_GROWTH * elapsed) : L.mult;
          const hx = mapX(elapsed);
          const hy = mapY(m);
          if (L.phase === 'fly' && trailCount < MAXP) {
            const arr = trailGeo.getAttribute('position');
            arr.setXYZ(trailCount, hx, hy, 0);
            trailCount += 1;
            trailGeo.setDrawRange(0, trailCount);
            arr.needsUpdate = true;
          }
          if (L.phase !== 'crashed') {
            rocket.position.set(hx, hy + 26, 0);
            // tilt along the curve: dy/dx of the log curve at this point
            const slope = (mapY(m * 1.06) - hy) / Math.max(1, mapX(elapsed + 0.35) - hx);
            rocket.rotation.z = -Math.atan(slope) * 0.9;
            rocket.userData.flame.visible = L.phase === 'fly';
            if (L.phase === 'fly') rocket.userData.flame.scale.set(1, 0.8 + Math.random() * 0.55, 1);
          }
        }
        if (boomAt) {
          const k = (now - boomAt) / 1000;
          if (k < 1.1) {
            boom.material.opacity = Math.max(0, 0.95 - k * 0.85);
            const arr = boom.geometry.getAttribute('position');
            for (let i = 0; i < 90; i++) {
              const a = (i / 90) * Math.PI * 2 + (i % 7);
              const r = k * (36 + (i % 9) * 9);
              arr.setXYZ(i, boomOrigin.x + Math.cos(a) * r, boomOrigin.y + Math.sin(a) * r * 0.8 + k * 14, boomOrigin.z);
            }
            arr.needsUpdate = true;
          } else boom.material.opacity = 0;
        }
      }

      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        sync(now);
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      cleanup = () => {
        cancelAnimationFrame(raf);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [liveRef]);

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />;
}

export default function RocketCrash({ onFinish }) {
  const [phase, setPhase] = useState('count'); // count | fly | cashed | crashed
  const [mult, setMult] = useState(1);
  const [trail, setTrail] = useState([]);
  const crashAt = useRef(drawCrashPoint());
  const flyStart = useRef(null);
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);
  const liveRef = useRef({ phase: 'count', mult: 1, flyStart: null });
  liveRef.current = { phase, mult, flyStart: flyStart.current };

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      flyStart.current = Date.now();
      setPhase('fly');
    }, 1000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== 'fly') return;
    const iv = setInterval(() => {
      const elapsed = (Date.now() - flyStart.current) / 1000;
      const m = Math.exp(CRASH_GROWTH * elapsed);
      if (m >= crashAt.current) {
        setMult(crashAt.current);
        setPhase('crashed');
        haptic('heavy');
        return;
      }
      if (m >= CRASH_MAX_MULT) {
        setMult(CRASH_MAX_MULT);
        cashOut(CRASH_MAX_MULT);
        return;
      }
      setMult(m);
      setTrail((tr) =>
        [...tr.slice(-160), { t: elapsed, m }].filter(
          (_, i, a) => i === a.length - 1 || i % 2 === 0
        )
      );
    }, 50);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase !== 'crashed' && phase !== 'cashed') return;
    if (finished.current) return;
    finished.current = true;
    const id = setTimeout(() => {
      if (phase === 'crashed') {
        onFinish({
          outcome: 'crash',
          multiplier: Number(crashAt.current.toFixed(2)),
          durationMs: Date.now() - mountedAt.current,
        });
      }
    }, 1300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function cashOut(atMult) {
    if (phase !== 'fly') return;
    const m = Number(atMult.toFixed(2));
    setPhase('cashed');
    haptic('medium');
    setTimeout(() => {
      onFinish({
        outcome: 'win',
        multiplier: m,
        durationMs: Date.now() - mountedAt.current,
      });
    }, 900);
  }

  const payout = Math.floor(10 * mult);
  const canCash = phase === 'fly' && mult >= CRASH_MIN_CASH;

  return (
    <main className="crash-wrap">
      <h2 className="crash-title">🚀 ROCKET CRASH 3D</h2>
      <p className="crash-sub">
        Ride the multiplier — bail before it blows. Max win 50 PTS at 5.00×.
      </p>

      <div className={`crash-stage crash-stage-3d ${phase === 'crashed' ? 'crash-boom' : ''}`}>
        <CrashStage3D liveRef={liveRef} />
        <div className={`crash-mult ${phase === 'fly' ? 'flying' : ''} ${phase === 'cashed' ? 'cashed' : ''}`}>
          {phase === 'count' && '🚀 Launching…'}
          {phase === 'fly' && fmt(mult)}
          {phase === 'cashed' && `✅ Bailed at ${fmt(mult)}`}
          {phase === 'crashed' && `💥 Crashed at ${fmt(mult)}`}
        </div>
        {phase === 'fly' && (
          <div className="crash-now">
            {mult >= CRASH_MIN_CASH
              ? `Bail now for ${payout} PTS`
              : `Cash-out unlocks at ${CRASH_MIN_CASH.toFixed(2)}×`}
          </div>
        )}
        {phase === 'cashed' && <div className="crash-now">{payout} PTS banked!</div>}
      </div>

      <button
        className="btn btn-big btn-cash"
        disabled={!canCash}
        onClick={() => cashOut(mult)}
      >
        {phase === 'fly'
          ? canCash
            ? `💰 CASH OUT — ${payout} PTS`
            : `🔒 CASH OUT (at ${CRASH_MIN_CASH.toFixed(2)}×)`
          : phase === 'count'
            ? '🚀 LAUNCHING…'
            : '🚀 ROCKET CRASH'}
      </button>
      <p className="crash-note">
        Greed check: most rockets blow before 2×. Every second you ride,
        the prize grows — and so does the chance it's gone.
      </p>
    </main>
  );
}
