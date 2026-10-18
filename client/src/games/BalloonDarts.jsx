import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// FRG Balloon Darts — now a REAL 3D carnival wall (Three.js).
// 12 balloons, 3 darts. Eight balloons hide FRG
// prizes (sum 40), two are empty, two hide a BURST that zeroes the pot.
// After each dart the player may BANK the pot or throw again and risk
// it all. Monte-Carlo (300k games): throw-every-dart EV ≈ 6.57 PTS on
// the 10 PTS entry; even the best bank strategy only reaches ≈ 6.66 —
// the treasury keeps ~3.4 PTS a game either way. Max pot 27 PTS.
export const DART_PRIZES = [12, 9, 6, 5, 3, 2, 2, 1];
export const DART_MAX_POT = 27;
const EMPTIES = 2;
const BURSTS = 2;
const DARTS = 3;
const COLORS = [
  '#ef4444', '#f59e0b', '#84cc16', '#06b6d4',
  '#ec4899', '#a855f7', '#f97316', '#22c55e',
  '#3b82f6', '#eab308', '#14b8a6', '#f43f5e',
];

function shuffledWall() {
  const wall = [
    ...DART_PRIZES,
    ...Array(EMPTIES).fill(0),
    ...Array(BURSTS).fill(-1),
  ];
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

// ---------------------------------------------------------------------
// The 3D balloon wall. Game state stays in the React component; this
// stage renders a carnival booth: striped back wall, twelve glossy
// balloons bobbing on their knots. A tap raycasts to a balloon, a
// little dart flies in, the balloon bursts into latex shards, and
// the prize stays floating where it popped. Presentation only.
// ---------------------------------------------------------------------
function DartsStage3D({ liveRef, popRef }) {
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
      const H = 330;
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x14081f);
      scene.fog = new THREE.Fog(0x14081f, 900, 2200);
      const camera = new THREE.PerspectiveCamera(48, W / H, 1, 4000);
      camera.position.set(200, 176, 402);
      camera.lookAt(200, 166, 0);

      scene.add(new THREE.HemisphereLight(0xffe8f4, 0x2a1030, 1.55));
      const sun = new THREE.DirectionalLight(0xfff2cf, 2.0);
      sun.position.set(130, 280, 480);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0xff9de2, 0.5);
      fill.position.set(-240, 100, 260);
      scene.add(fill);

      // carnival booth: striped back wall + frame + counter
      {
        const cv = document.createElement('canvas');
        cv.width = 512;
        cv.height = 512;
        const c2 = cv.getContext('2d');
        for (let i = 0; i < 8; i++) {
          c2.fillStyle = i % 2 ? '#7f1d3d' : '#f3e2c7';
          c2.fillRect(i * 64, 0, 64, 512);
        }
        c2.fillStyle = 'rgba(10,4,18,0.34)';
        c2.fillRect(0, 0, 512, 512);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(412, 300, 14),
          new THREE.MeshStandardMaterial({ color: 0x5b2140, roughness: 0.7 })
        );
        wall.position.set(200, 172, -26);
        scene.add(wall);
        const face = new THREE.Mesh(
          new THREE.PlaneGeometry(388, 276),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
        );
        face.position.set(200, 172, -18);
        scene.add(face);
        const counter = new THREE.Mesh(
          new THREE.BoxGeometry(412, 26, 44),
          new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.5, metalness: 0.3 })
        );
        counter.position.set(200, 10, 2);
        scene.add(counter);
        // booth bulbs along the top
        for (let i = 0; i < 9; i++) {
          const b = new THREE.Mesh(
            new THREE.SphereGeometry(5.4, 10, 8),
            new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd76e : 0xff9de2 })
          );
          b.position.set(24 + i * 44, 330, -14);
          scene.add(b);
        }
      }

      const balloonPos = (i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return { x: 62 + col * 92, y: 262 - row * 84 };
      };
      function valueSprite(v) {
        const cv = document.createElement('canvas');
        cv.width = 192;
        cv.height = 128;
        const c2 = cv.getContext('2d');
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        if (v === -1) {
          c2.font = '76px system-ui';
          c2.fillText('💥', 96, 66);
        } else if (v > 0) {
          c2.font = '900 62px system-ui';
          c2.strokeStyle = 'rgba(20,8,0,0.9)';
          c2.lineWidth = 10;
          c2.strokeText(`+${v}`, 96, 64);
          c2.fillStyle = '#ffd94d';
          c2.fillText(`+${v}`, 96, 64);
        } else {
          c2.font = '700 40px system-ui';
          c2.fillStyle = '#94a3b8';
          c2.fillText('empty', 96, 64);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        sp.scale.set(88, 59, 1);
        return sp;
      }

      const balloons = [];
      const knotGeo = new THREE.ConeGeometry(5, 10, 8);
      for (let i = 0; i < 12; i++) {
        const { x, y } = balloonPos(i);
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(COLORS[i]), roughness: 0.16, metalness: 0.05, emissive: new THREE.Color(COLORS[i]), emissiveIntensity: 0.14 });
        const body = new THREE.Mesh(new THREE.SphereGeometry(33, 20, 16), mat);
        body.scale.set(1, 1.14, 0.85);
        body.userData.balloonIndex = i;
        g.add(body);
        const knot = new THREE.Mesh(knotGeo, mat);
        knot.rotation.x = Math.PI;
        knot.position.y = -40;
        g.add(knot);
        const shine = new THREE.Mesh(
          new THREE.SphereGeometry(9, 10, 8),
          new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
        );
        shine.position.set(-11, 14, 24);
        g.add(shine);
        g.position.set(x, y, 0);
        scene.add(g);
        balloons.push({ g, body, idx: i, state: 'idle', at: 0 });
      }
      // the dart (one flight at a time is plenty — pops are user-paced)
      const dart = new THREE.Group();
      {
        const shaft = new THREE.Mesh(
          new THREE.CylinderGeometry(2.4, 2.4, 30, 8),
          new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.3, metalness: 0.7 })
        );
        shaft.rotation.x = Math.PI / 2;
        dart.add(shaft);
        const tip = new THREE.Mesh(
          new THREE.ConeGeometry(3.4, 12, 8),
          new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.25, metalness: 0.8 })
        );
        tip.rotation.x = Math.PI / 2;
        tip.position.z = 20;
        dart.add(tip);
        const finMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        for (const rz of [0, Math.PI / 2]) {
          const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 15, 11), finMat);
          fin.position.z = -14;
          fin.rotation.z = rz;
          dart.add(fin);
        }
        dart.visible = false;
        scene.add(dart);
      }
      // burst shards pool
      const shards = [];
      const shardGeo = new THREE.TetrahedronGeometry(6);
      for (let i = 0; i < 40; i++) {
        const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
        m.visible = false;
        scene.add(m);
        shards.push({ m, vx: 0, vy: 0, vz: 0, life: 0 });
      }
      let flight = null; // {target, from, to, startedAt}
      const resultSprites = new Map();

      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      function onTap(e) {
        const L = liveRef.current || {};
        if (L.phase !== 'aim') return;
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(balloons.filter((b) => b.state === 'idle').map((b) => b.body), false);
        if (hits.length) popRef.current?.(hits[0].object.userData.balloonIndex);
      }
      renderer.domElement.addEventListener('pointerdown', onTap);

      function sync(now) {
        const L = liveRef.current || {};
        const revealed = L.revealed || {};
        for (const b of balloons) {
          const v = revealed[b.idx];
          if (v !== undefined && b.state === 'idle') {
            const { x, y } = balloonPos(b.idx);
            const at = new THREE.Vector3(x, y + Math.sin(now / 480 + b.idx * 1.7) * 3, 26);
            if (flight) {
              // a dart is already in the air — pop this one on the spot
              b.state = 'popped';
              b.g.visible = false;
              const sp0 = valueSprite(v);
              sp0.position.copy(at);
              sp0.position.z = 10;
              scene.add(sp0);
              resultSprites.set(b.idx, sp0);
            } else {
              b.state = 'flying';
              b.at = now;
              flight = { target: b, from: new THREE.Vector3(x * 0.45 + 110, 6, 210), to: at, startedAt: now, value: v };
              dart.visible = true;
            }
          }
          if (b.state === 'idle') {
            b.g.position.y = balloonPos(b.idx).y + Math.sin(now / 480 + b.idx * 1.7) * 3.4;
          }
        }
        if (flight) {
          const k = Math.min(1, (now - flight.startedAt) / 135);
          dart.position.lerpVectors(flight.from, flight.to, k);
          dart.lookAt(flight.to.x, flight.to.y, flight.to.z + 40);
          if (k >= 1) {
            const b = flight.target;
            b.state = 'popped';
            b.g.visible = false;
            dart.visible = false;
            // shards in the balloon's color
            let used = 0;
            for (const sh of shards) {
              if (sh.life > 0) continue;
              sh.life = 0.5;
              sh.m.visible = true;
              sh.m.material.color.set(COLORS[b.idx]);
              sh.m.material.opacity = 1;
              sh.m.position.copy(flight.to);
              const a = Math.random() * Math.PI * 2;
              const sp = 60 + Math.random() * 150;
              sh.vx = Math.cos(a) * sp;
              sh.vy = Math.sin(a) * sp + 40;
              sh.vz = 30 + Math.random() * 90;
              if (++used >= 11) break;
            }
            const sp = valueSprite(flight.value);
            sp.position.copy(flight.to);
            sp.position.z = 10;
            scene.add(sp);
            resultSprites.set(b.idx, sp);
            flight = null;
          }
        }
        for (const sh of shards) {
          if (sh.life <= 0) continue;
          sh.life -= 1 / 60;
          sh.m.position.x += sh.vx / 60;
          sh.m.position.y += sh.vy / 60;
          sh.m.position.z += sh.vz / 60;
          sh.vy -= 320 / 60;
          sh.m.rotation.x += 0.21;
          sh.m.rotation.y += 0.17;
          sh.m.material.opacity = Math.max(0, sh.life * 2);
          if (sh.life <= 0) sh.m.visible = false;
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
        renderer.domElement.removeEventListener('pointerdown', onTap);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [liveRef, popRef]);

  return (
    <div
      ref={mountRef}
      style={{ position: 'relative', width: '100%', aspectRatio: '400 / 330', borderRadius: 12, overflow: 'hidden', margin: '0 auto', maxWidth: 430 }}
    />
  );
}


export default function BalloonDarts({ onFinish }) {
  const wall = useRef(shuffledWall());
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);
  const pops = useRef(0);
  const [revealed, setRevealed] = useState({});
  const [pot, setPot] = useState(0);
  const [phase, setPhase] = useState('aim'); // aim | done
  const [msg, setMsg] = useState('Tap a balloon — throw a dart! 🎯');
  const liveRef = useRef({ revealed: {}, phase: 'aim' });
  const popRef = useRef(null);
  liveRef.current = { revealed, phase };
  popRef.current = pop;

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  function finish(outcome, amount, burst, delay) {
    if (finished.current) return;
    finished.current = true;
    setPhase('done');
    setTimeout(() => {
      onFinish({
        outcome,
        amount,
        burst,
        dartsUsed: pops.current,
        durationMs: Date.now() - mountedAt.current,
      });
    }, delay);
  }

  function pop(i) {
    if (phase !== 'aim' || revealed[i] !== undefined) return;
    const v = wall.current[i];
    pops.current += 1;
    setRevealed((r) => ({ ...r, [i]: v }));

    if (v === -1) {
      haptic('heavy');
      setMsg(`💥 BURST BALLOON! Your pot of ${pot} PTS is gone!`);
      setPot(0);
      finish('bust', 0, true, 1400);
      return;
    }
    haptic('light');
    const newPot = pot + v;
    setPot(newPot);
    if (pops.current >= DARTS) {
      setMsg(
        newPot > 0
          ? `🎯 Out of darts — pot locked at ${newPot} PTS!`
          : '🎯 Out of darts — and the pot is empty. Ouch.'
      );
      finish(newPot > 0 ? 'win' : 'bust', newPot, false, 1100);
    } else if (v > 0) {
      setMsg(`🎈 +${v} PTS in the pot! Bank it, or risk it on the next dart?`);
    } else {
      setMsg('🎈 Empty balloon… nothing inside. Darts left — keep going?');
    }
  }

  function bank() {
    if (phase !== 'aim' || pot <= 0) return;
    haptic('medium');
    setMsg(`🏦 Banked ${pot} PTS. Smart money walks away!`);
    finish('win', pot, false, 700);
  }

  const dartsLeft = DARTS - pops.current;

  return (
    <main className="darts-wrap">
      <h2 className="darts-title">🎈 BALLOON DARTS 3D</h2>
      <p className="darts-sub">
        3 darts, 12 balloons. Build a pot — but two balloons hide a 💥
        that bursts it all.
      </p>

      <div className="darts-status">
        <span className="darts-darts">
          {'🎯'.repeat(Math.max(0, dartsLeft))}
          <span className="darts-used">{'🎯'.repeat(pops.current)}</span>
        </span>
        <span className="darts-pot">POT: {pot} PTS</span>
      </div>

      <DartsStage3D liveRef={liveRef} popRef={popRef} />

      <p className="darts-msg">{msg}</p>

      {phase === 'aim' && pot > 0 && pops.current < DARTS && (
        <button className="btn btn-big btn-bank" onClick={bank}>
          🏦 BANK {pot} PTS
        </button>
      )}
      <p className="darts-note">
        Prizes in the wall: 12 · 9 · 6 · 5 · 3 · 2 · 2 · 1 PTS — plus two
        empties and two 💥. Max pot 27 PTS.
      </p>
    </main>
  );
}
