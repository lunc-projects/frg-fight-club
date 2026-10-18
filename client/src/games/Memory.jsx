import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// ---------------------------------------------------------------------------
// FRG Memory — Simon-style sequence recall. Score is paid ONLY on round
// completion: score = 100*R + 25 * R*(R+1)/2 for R completed rounds, so
// the server re-derives it EXACTLY from the round count. 3 strikes ends
// the run; a strike replays the same sequence.
// ---------------------------------------------------------------------------

export const MEMORY_TIERS = [
  { min: 3000, amount: 45 },
  { min: 2100, amount: 32 },
  { min: 1400, amount: 22 },
  { min: 875, amount: 15 },
  { min: 450, amount: 10 },
  { min: 150, amount: 5 },
];
export function memoryScore(rounds) {
  return 100 * rounds + 25 * ((rounds * (rounds + 1)) / 2);
}
export function memoryAmount(score) {
  const t = MEMORY_TIERS.find((x) => score >= x.min);
  return t ? t.amount : 0;
}

const PADS = [
  { color: '#f59e0b', dim: '#78350f', icon: '▲', name: 'gold' },
  { color: '#38bdf8', dim: '#0c4a6e', icon: '●', name: 'sky' },
  { color: '#e879f9', dim: '#701a75', icon: '■', name: 'pink' },
  { color: '#4ade80', dim: '#14532d', icon: '◆', name: 'green' },
];

// ---------------------------------------------------------------------
// The 3D memory console. The Simon logic (sequence, strikes, timers)
// stays in the component's effect; this stage renders a chunky 3D
// console with four big pads that light up and physically dip when
// lit — during playback and on your presses alike. Taps raycast to
// the same press() the buttons used. Presentation only.
// ---------------------------------------------------------------------
function MemoryStage3D({ liveRef, pressRef }) {
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
      const H = 320;
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x090d1a);
      scene.fog = new THREE.Fog(0x090d1a, 1000, 2400);
      const camera = new THREE.PerspectiveCamera(48, W / H, 1, 4000);
      camera.position.set(200, 148, 388);
      camera.lookAt(200, 168, 0);

      scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x141c30, 1.5));
      const sun = new THREE.DirectionalLight(0xfff2cf, 1.9);
      sun.position.set(130, 260, 480);
      scene.add(sun);
      const glow = new THREE.PointLight(0xffffff, 0, 420);
      glow.position.z = 130;
      scene.add(glow);

      // the console slab with the club's memory art as an inlay
      {
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(344, 308, 18),
          new THREE.MeshStandardMaterial({ color: 0x131c33, roughness: 0.5, metalness: 0.3 })
        );
        slab.position.set(200, 160, -10);
        scene.add(slab);
        const tex = new THREE.TextureLoader().load('/covers/memory.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const inlay = new THREE.Mesh(
          new THREE.PlaneGeometry(330, 294),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.16 })
        );
        inlay.position.set(200, 160, -0.5);
        scene.add(inlay);
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(352, 316, 6),
          new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.4, metalness: 0.55 })
        );
        trim.position.set(200, 160, -16);
        scene.add(trim);
      }

      function glyphTexture(icon) {
        const cv = document.createElement('canvas');
        cv.width = 128;
        cv.height = 128;
        const c2 = cv.getContext('2d');
        c2.font = '84px system-ui';
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        c2.fillStyle = 'rgba(10,14,26,0.88)';
        c2.fillText(icon, 64, 70);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      }

      const padPos = (i) => ({ x: 200 + (i % 2 ? 71 : -71), y: 160 + (i < 2 ? 71 : -71) });
      const pads = [];
      for (let i = 0; i < 4; i++) {
        const P = PADS[i];
        const { x, y } = padPos(i);
        const g = new THREE.Group();
        g.position.set(x, y, 6);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(P.dim),
          roughness: 0.32,
          emissive: new THREE.Color(P.color),
          emissiveIntensity: 0.16,
        });
        const body = new THREE.Mesh(new THREE.BoxGeometry(122, 122, 20), mat);
        body.userData.padIndex = i;
        g.add(body);
        const glyph = new THREE.Mesh(
          new THREE.PlaneGeometry(74, 74),
          new THREE.MeshBasicMaterial({ map: glyphTexture(P.icon), transparent: true })
        );
        glyph.position.z = 10.5;
        g.add(glyph);
        scene.add(g);
        pads.push({ g, mat, idx: i, color: new THREE.Color(P.color) });
      }
      // strike flash plane
      const flashPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(400, 320),
        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0 })
      );
      flashPlane.position.set(200, 160, 120);
      scene.add(flashPlane);

      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      function onTap(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(pads.map((p) => p.g.children[0]), false);
        if (hits.length) pressRef.current?.(hits[0].object.userData.padIndex);
      }
      renderer.domElement.addEventListener('pointerdown', onTap);

      function sync(now) {
        const L = liveRef.current || {};
        for (const p of pads) {
          const isLit = L.lit === p.idx;
          const target = isLit ? 1.65 : 0.16;
          p.mat.emissiveIntensity += (target - p.mat.emissiveIntensity) * 0.45;
          const dip = isLit ? -3.5 : 0;
          p.g.position.z += (6 + dip - p.g.position.z) * 0.5;
          if (isLit) {
            glow.position.set(p.g.position.x, p.g.position.y, 130);
            glow.color.copy(p.color);
            glow.intensity = 150;
          }
        }
        if (L.lit === -1 || L.lit === undefined) glow.intensity = Math.max(0, glow.intensity - 22);
        flashPlane.material.opacity += (((L.badFlash ? 0.3 : 0)) - flashPlane.material.opacity) * 0.5;
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
  }, [liveRef, pressRef]);

  return (
    <div
      ref={mountRef}
      style={{ position: 'relative', width: '100%', aspectRatio: '400 / 320', borderRadius: 16, overflow: 'hidden' }}
    />
  );
}


export default function Memory({ onFinish }) {
  const [lit, setLit] = useState(-1);
  const [badFlash, setBadFlash] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [round, setRound] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState('Watch the pads, then repeat the sequence. It grows by one every round.');
  const [cheer, setCheer] = useState(null);
  const M = useRef(null);
  const liveRef = useRef({ lit: -1, badFlash: false });
  const pressRef = useRef(null);
  liveRef.current = { lit, badFlash };
  pressRef.current = (i) => M.current?.press(i);

  useEffect(() => {
    const S = {
      seq: [],
      idx: 0,
      round: 0,
      done: 0,
      strikes: 0,
      phase: 'idle',
      startedAt: null,
      timers: [],
      dead: false,
    };
    M.current = S;

    const later = (fn, ms) => {
      const t = setTimeout(() => {
        if (!S.dead) fn();
      }, ms);
      S.timers.push(t);
    };

    function showSequence() {
      S.phase = 'show';
      setPhase('show');
      setMsg(`Round ${S.round} — watch…`);
      const stepMs = Math.max(640 - S.round * 20, 360);
      S.seq.forEach((pad, i) => {
        later(() => {
          setLit(pad);
          later(() => setLit(-1), stepMs * 0.62);
        }, 500 + i * stepMs);
      });
      later(() => {
        S.phase = 'input';
        S.idx = 0;
        setPhase('input');
        setMsg('Your turn — repeat it!');
      }, 500 + S.seq.length * stepMs + 150);
    }

    function nextRound() {
      S.round += 1;
      S.seq.push(Math.floor(Math.random() * 4));
      setRound(S.round);
      setScore(memoryScore(S.round - 1));
      showSequence();
    }

    function gameOver() {
      S.phase = 'over';
      setPhase('over');
      const completed = S.done;
      const sc = memoryScore(completed);
      setScore(sc);
      setMsg(`🧠 Game over — you completed ${completed} round${completed === 1 ? '' : 's'} (${sc} points).`);
      const amount = memoryAmount(sc);
      setTimeout(() => {
        if (S.dead) return;
        onFinish({
          outcome: amount > 0 ? 'win' : 'lose',
          score: sc,
          amount,
          rounds: completed,
          durationMs: Date.now() - (S.startedAt || Date.now()),
        });
      }, 900);
    }

    S.start = () => {
      if (S.phase !== 'idle') return;
      S.startedAt = Date.now();
      S.round = 0;
      nextRound();
    };

    S.press = (pad) => {
      if (S.phase !== 'input') return;
      setLit(pad);
      setTimeout(() => setLit(-1), 180);
      if (pad === S.seq[S.idx]) {
        S.idx += 1;
        if (S.idx >= S.seq.length) {
          S.phase = 'between';
          setPhase('between');
          const completed = S.round;
          S.done = completed;
          setScore(memoryScore(completed));
          setMsg(`✅ Round ${completed} complete! +${100 + 25 * completed} points`);
          setCheer({ round: completed, pts: 100 + 25 * completed, key: Date.now() });
          later(() => setCheer(null), 1050);
          later(nextRound, 1100);
        }
      } else {
        S.strikes += 1;
        setStrikes(S.strikes);
        setBadFlash(true);
        setTimeout(() => setBadFlash(false), 350);
        if (S.strikes >= 3) {
          gameOver();
        } else {
          S.phase = 'between';
          setPhase('between');
          setMsg(`❌ Strike ${S.strikes} of 3 — watch it again…`);
          later(showSequence, 1200);
        }
      }
    };

    window.__frgMemory = {
      state: () => ({
        round: S.round,
        completed: S.done,
        score: memoryScore(S.done),
        strikes: S.strikes,
        phase: S.phase,
        over: S.phase === 'over',
      }),
      seq: () => [...S.seq],
      press: (i) => S.press(i),
      start: () => S.start(),
    };

    return () => {
      S.dead = true;
      S.timers.forEach(clearTimeout);
      delete window.__frgMemory;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 430, margin: '0 auto', padding: 12 }}>
      <h2 className="game-title">🧠 FRG MEMORY 3D</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>ROUND <b>{round}</b></span>
        <span>SCORE <b>{score}</b></span>
        <span>{'✖'.repeat(strikes)}{'·'.repeat(Math.max(0, 3 - strikes))}</span>
      </div>
      <div style={{ position: 'relative' }}>
      <MemoryStage3D liveRef={liveRef} pressRef={pressRef} />
      {cheer && (
        <div key={cheer.key} className="mem-callout">
          🎉 ROUND {cheer.round} CLEAR! +{cheer.pts}
        </div>
      )}
      </div>
      <p style={{ textAlign: 'center', minHeight: 22 }}>{msg}</p>
      {phase === 'idle' && (
        <button className="btn btn-big" style={{ width: '100%' }} onClick={() => M.current?.start()}>
          ▶ Start — watch round 1
        </button>
      )}
      <p className="fineprint">
        A finished round pays 100 + 25 per step. Three strikes ends the
        run. Tiers: 150→5 · 450→10 · 875→15 · 1,400→22 · 2,100→32 · 3,000→45.
      </p>
    </main>
  );
}
