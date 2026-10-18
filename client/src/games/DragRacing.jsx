import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// FRG Drag Racing — beat the tree, nail the shifts, outrun the rival.
// Now with a REAL 3D drag strip (Three.js): two low-poly 3D cars under
// the lights, a 3D christmas tree at the start line, a tracking camera
// that follows the race. The skill model is unchanged (simulation-
// tuned): the tach sweeps each of 5 gears; shifting at 78-95% is
// PERFECT (boost 1.30), 55-78% is good, earlier bogs the car (1.4s
// momentum loss), riding into the 100% limiter is worst. A great
// launch (<=220ms reaction) earns a 1.18 boost. Rival runs 9.60-11.00s.
const GEAR_TIME = [3.0, 2.6, 2.3, 2.1, 999]; // s for rpm 0->100, gears 1..5
const GEAR_RATE = [0.048, 0.07, 0.092, 0.108, 0.118]; // track/sec at boost 1
const ZONE = {
  perfect: [0.0, 1.3],
  good: [0.5, 1.05],
  early: [1.4, 0.85],
  limiter: [1.2, 0.8],
};
const RIVAL_BASE = 9600;
const RIVAL_SPREAD = 1400;

function drawRivalEt() {
  const tri = (Math.random() + Math.random() + Math.random()) / 3;
  return Math.round(RIVAL_BASE + tri * RIVAL_SPREAD);
}

const TRACK_START = -430;
const TRACK_LEN = 880;

// ---------------------------------------------------------------------
// The 3D stage. Reads the live race state object every frame; owns no
// game logic.
// ---------------------------------------------------------------------
function RaceStage3D({ stateRef }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const S = stateRef;
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
      scene.background = new THREE.Color(0x0a0f22);
      scene.fog = new THREE.Fog(0x0a0f22, 700, 1900);
      const camera = new THREE.PerspectiveCamera(55, W / H, 1, 4000);

      scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x141428, 1.5));
      const sun = new THREE.DirectionalLight(0xfff1cf, 1.9);
      sun.position.set(120, 320, 420);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fb2ff, 0.6);
      fill.position.set(-200, 140, 300);
      scene.add(fill);

      // backdrop: the club's night strip art (XY side-view world:
      // x = down-track, y = up, z = toward the camera; lanes split on z)
      {
        const tex = new THREE.TextureLoader().load('/art/racing-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const bg = new THREE.Mesh(
          new THREE.PlaneGeometry(1900, 640),
          new THREE.MeshBasicMaterial({ map: tex, fog: false })
        );
        bg.position.set(0, 170, -215);
        scene.add(bg);
        scene.userData.bg = bg;
      }
      // asphalt + lane paint
      {
        const strip = new THREE.Mesh(
          new THREE.BoxGeometry(1500, 12, 196),
          new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.95 })
        );
        strip.position.set(60, -8, 0);
        scene.add(strip);
        const dashMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
        for (let x = -560; x < 700; x += 46) {
          const d = new THREE.Mesh(new THREE.BoxGeometry(24, 1.6, 3.4), dashMat);
          d.position.set(x, -1, 0);
          scene.add(d);
        }
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        for (const z of [-64, 64]) {
          const l = new THREE.Mesh(new THREE.BoxGeometry(1500, 1.6, 3.4), lineMat);
          l.position.set(60, -1, z);
          scene.add(l);
        }
        // finish gantry
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 });
        for (const z of [-70, 70]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 150, 8), poleMat);
          pole.position.set(TRACK_START + TRACK_LEN, 75, z);
          scene.add(pole);
        }
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(6, 26, 150),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.12 })
        );
        banner.position.set(TRACK_START + TRACK_LEN, 150, 0);
        scene.add(banner);
        // floodlight poles along the back
        const lampMat = new THREE.MeshBasicMaterial({ color: 0xd6f4ff });
        for (let i = 0; i < 6; i++) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 170, 6), poleMat);
          pole.position.set(-480 + i * 260, 85, -120);
          scene.add(pole);
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), lampMat);
          lamp.position.set(-480 + i * 260, 176, -120);
          scene.add(lamp);
        }
      }
      // christmas tree at the start line
      const treeLights = [];
      {
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 120, 8), poleMat);
        pole.position.set(TRACK_START - 52, 60, -88);
        scene.add(pole);
        const cols = [0xffb020, 0xffb020, 0xffb020, 0x22c55e];
        for (let i = 0; i < 4; i++) {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(8.4, 12, 10),
            new THREE.MeshBasicMaterial({ color: 0x1f2937 })
          );
          m.position.set(TRACK_START - 52, 108 - i * 27, -88);
          scene.add(m);
          treeLights.push({ mesh: m, onColor: cols[i] });
        }
      }
      // side-profile low-poly cars
      function makeSideCar(colorHex, isPlayer) {
        const g = new THREE.Group();
        const paint = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.55, emissive: colorHex, emissiveIntensity: 0.13 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(118, 24, 44), paint);
        body.position.set(0, 22, 0);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(30, 17, 40), paint);
        nose.position.set(66, 17, 0);
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(52, 19, 38),
          new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.12, metalness: 0.3 })
        );
        cabin.position.set(-8, 43, 0);
        g.add(body, nose, cabin);
        if (isPlayer) {
          const spoiler = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 46), paint);
          spoiler.position.set(-60, 47, 0);
          g.add(spoiler);
        }
        const wheelGeo = new THREE.CylinderGeometry(13.5, 13.5, 8, 14);
        wheelGeo.rotateX(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 0.9 });
        const wheels = [];
        for (const wx of [-38, 40]) {
          for (const wz of [-23, 23]) {
            const w = new THREE.Mesh(wheelGeo, wheelMat);
            w.position.set(wx, 13, wz);
            g.add(w);
            wheels.push(w);
          }
        }
        const flameGeo = new THREE.ConeGeometry(7, 30, 10);
        flameGeo.rotateZ(Math.PI / 2);
        const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xff8c3a, transparent: true, opacity: 0.92 }));
        flame.position.set(-78, 18, 0);
        flame.visible = false;
        g.add(flame);
        scene.add(g);
        return { g, wheels, flame };
      }
      const player = makeSideCar(0xf7b733, true);
      const rival = makeSideCar(0xd23b3b, false);
      player.g.position.z = 32;
      rival.g.position.z = -32;

      function sync(now) {
        const px = TRACK_START + S.dist * TRACK_LEN;
        const rx = TRACK_START + S.rivalDist * TRACK_LEN;
        player.g.position.x = px;
        rival.g.position.x = rx;
        const spin = S.launched && S.phase === 'racing' ? 0.55 : 0;
        for (const w of player.wheels) w.rotation.z -= spin;
        for (const w of rival.wheels) w.rotation.z -= S.phase === 'racing' ? 0.5 : 0;
        player.flame.visible = !!(S.launched && S.phase === 'racing');
        if (player.flame.visible) player.flame.scale.set(0.8 + Math.random() * 0.6, 1, 1);
        // tree lights
        const stageMs = Math.max(0, S.treeAt - Date.now());
        const ambers = S.phase === 'stage' ? (stageMs > 800 ? 0 : stageMs > 450 ? 1 : stageMs > 100 ? 2 : 3) : 3;
        treeLights.forEach((t, i) => {
          let on = false;
          let color = t.onColor;
          if (i < 3) on = S.phase === 'stage' ? ambers > i : false;
          else if (S.outcome === 'foul') { on = true; color = 0xef4444; }
          else on = S.phase === 'racing' || S.phase === 'done';
          t.mesh.material.color.set(on ? color : 0x1f2937);
        });
        // tracking camera, biased to the player
        const focus = Math.max(-390, Math.min(430, px * 0.86));
        camera.position.set(focus, 92, 335);
        camera.lookAt(focus + 26, 38, 0);
        if (scene.userData.bg) scene.userData.bg.position.x = focus * 0.92;
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
  }, [stateRef]);

  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0, borderRadius: 12, overflow: 'hidden' }}
    />
  );
}

export default function DragRacing({ onFinish }) {
  const [, setFrame] = useState(0);
  const render = () => setFrame((f) => f + 1);
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);
  const S = useRef({
    phase: 'stage', // stage | racing | done
    treeAt: Date.now() + 1150 + Math.random() * 500,
    greenAt: null,
    launched: false,
    reactionMs: null,
    gear: 0,
    rpm: 0,
    dist: 0,
    boost: 1,
    dead: 0,
    perfects: 0,
    lastShift: '',
    rivalEt: drawRivalEt(),
    rivalDist: 0,
    etMs: null,
    outcome: null,
    msg: 'Stage up… wait for the green! 🟢',
  }).current;

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  function finish(outcome, delay = 1400) {
    if (finished.current) return;
    finished.current = true;
    S.phase = 'done';
    S.outcome = outcome;
    render();
    setTimeout(() => {
      onFinish({
        outcome,
        etMs: S.etMs ? Math.round(S.etMs) : 0,
        rivalEtMs: S.rivalEt,
        perfectShifts: S.perfects,
        reactionMs: S.reactionMs ? Math.round(S.reactionMs) : 0,
        durationMs: Date.now() - mountedAt.current,
      });
    }, delay);
  }

  useEffect(() => {
    let last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (finished.current) return;

      if (S.phase === 'stage') {
        if (Date.now() >= S.treeAt) {
          S.phase = 'racing';
          S.greenAt = Date.now();
          S.msg = '🟢 GREEN! LAUNCH!';
          haptic('medium');
        }
        render();
        return;
      }
      if (S.phase !== 'racing') return;

      const sinceGreen = (Date.now() - S.greenAt) / 1000;
      S.rivalDist = Math.min(1, sinceGreen / (S.rivalEt / 1000));
      if (sinceGreen > 20 && S.etMs == null) {
        S.etMs = 20000;
        S.msg = '🏁 You never got going — the rival takes it.';
        finish('lose');
        return;
      }

      if (S.launched) {
        if (S.rpm >= 100 && S.gear < 4) {
          S.dead = ZONE.limiter[0];
          S.boost = ZONE.limiter[1];
          S.gear += 1;
          S.rpm = 0;
          S.lastShift = '🔥 LIMITER! Over-revved — momentum killed.';
          haptic('heavy');
        }
        S.rpm += (dt / GEAR_TIME[S.gear]) * 100;
        const rate = GEAR_RATE[S.gear] * S.boost * (S.dead > 0 ? 0.05 : 1);
        if (S.dead > 0) S.dead -= dt;
        S.dist = Math.min(1, S.dist + dt * rate);
        if (S.dist >= 1) {
          S.etMs = Date.now() - S.greenAt;
          const win = S.etMs < S.rivalEt;
          S.msg = win
            ? `🏁 You win! ${(S.etMs / 1000).toFixed(2)}s vs rival ${(S.rivalEt / 1000).toFixed(2)}s`
            : `🏁 Outrun — your ${(S.etMs / 1000).toFixed(2)}s vs rival ${(S.rivalEt / 1000).toFixed(2)}s`;
          haptic(win ? 'medium' : 'heavy');
          finish(win ? 'win' : 'lose');
          return;
        }
      }
      render();
    }, 33);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tapButton() {
    if (finished.current) return;
    if (S.phase === 'stage') {
      // Jumped the start.
      S.msg = '🚨 RED LIGHT! You jumped the tree.';
      haptic('heavy');
      finish('foul');
      return;
    }
    if (S.phase !== 'racing') return;
    if (!S.launched) {
      S.launched = true;
      S.reactionMs = Date.now() - S.greenAt;
      S.boost = S.reactionMs <= 220 ? 1.18 : 1.0;
      S.msg =
        S.reactionMs <= 220
          ? `🚀 GREAT LAUNCH! ${(S.reactionMs / 1000).toFixed(2)}s reaction.`
          : `🏁 Away! Reaction ${(S.reactionMs / 1000).toFixed(2)}s. Watch the tach!`;
      haptic('light');
      render();
      return;
    }
    if (S.gear >= 4) return;
    const z =
      S.rpm >= 78 && S.rpm <= 95
        ? 'perfect'
        : S.rpm >= 55
          ? 'good'
          : 'early';
    if (z === 'perfect') {
      S.perfects += 1;
      S.lastShift = '⚡ PERFECT SHIFT!';
      haptic('medium');
    } else if (z === 'good') {
      S.lastShift = '👍 Good shift.';
      haptic('light');
    } else {
      S.lastShift = '🐌 Bogged down — shifted way too early!';
      haptic('heavy');
    }
    S.dead = ZONE[z][0];
    S.boost = ZONE[z][1];
    S.gear += 1;
    S.rpm = 0;
    render();
  }

  const stageMs = Math.max(0, S.treeAt - Date.now());
  const ambers = S.phase === 'stage' ? (stageMs > 800 ? 0 : stageMs > 450 ? 1 : stageMs > 100 ? 2 : 3) : 3;
  const isGreen = S.phase === 'racing' || S.phase === 'done';
  const btnLabel =
    S.phase === 'stage'
      ? '✋ WAIT FOR GREEN…'
      : S.phase === 'done'
        ? S.outcome === 'foul'
          ? '🚨 RED LIGHT'
          : '🏁 FINISHED'
        : !S.launched
          ? '🏁 LAUNCH!'
          : S.gear >= 4
            ? '🏎️ TOP GEAR — HOLD ON!'
            : '⬆️ SHIFT!';

  return (
    <main className="race-wrap">
      <h2 className="race-title">🏎️ DRAG RACING 3D</h2>
      <p className="race-sub">
        Beat the tree. Shift in the green band (78–95%). Winner takes 18 PTS.
      </p>

      <div className="tree">
        {[0, 1, 2].map((i) => (
          <span key={i} className={`tree-dot ${ambers > i ? 'amber-on' : ''}`} />
        ))}
        <span
          className={`tree-dot ${
            S.outcome === 'foul' ? 'red-on' : isGreen ? 'green-on' : ''
          }`}
        />
      </div>

      <div className="track-3d">
        <RaceStage3D stateRef={S} />
        {S.lastShift.includes('PERFECT') && S.phase === 'racing' && (
          <div key={S.perfects} className="shift-pop">⚡ PERFECT SHIFT!</div>
        )}
        {S.phase === 'done' && (
          <div className="race-callout">
            {S.outcome === 'win' ? '🏆 YOU WIN!' : S.outcome === 'foul' ? '🚨 RED LIGHT!' : '🏁 OUTRUN!'}
          </div>
        )}
      </div>

      <div className="tach">
        <div className="tach-needle" style={{ left: `${Math.min(100, S.rpm)}%` }} />
      </div>
      <div className="race-status">
        <span>
          GEAR <b>{S.gear + 1}</b>
        </span>
        <span>
          {S.etMs
            ? `ET ${(S.etMs / 1000).toFixed(2)}s`
            : S.launched
              ? `${Math.round(S.dist * 100)}%`
              : 'STAGED'}
        </span>
        <span>
          ⭐ PERFECT ×<b>{S.perfects}</b>
        </span>
      </div>

      <p className="race-msg">{S.phase === 'done' ? S.msg : S.lastShift || S.msg}</p>

      <button
        className="btn btn-big btn-race"
        onClick={tapButton}
        disabled={S.phase === 'done' || (S.phase === 'racing' && S.launched && S.gear >= 4)}
      >
        {btnLabel}
      </button>
      <p className="race-note">
        Jump the green and it's a red-light foul. Ride into the red and the
        limiter kills your momentum. The rival runs somewhere in the 9s–11s —
        you only see his time at the finish.
      </p>
    </main>
  );
}
