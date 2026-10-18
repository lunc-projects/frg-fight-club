import { useEffect, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// FRG Mines — now a REAL 3D board (Three.js). 16 tiles, 3 hidden
// mines, 13 gems. Every gem you dig
// raises the cash-out; one mine takes it all. Payouts are the fair
// combinatorial price scaled by 0.65, so the expected payout is
// ~6.5 PTS on the 10 PTS entry at EVERY cash-out depth (verified by
// Monte Carlo) — greed is free to try, the treasury keeps ~3.5 PTS
// a dig either way. The board auto-banks at 7 gems (max 43 PTS).
// The server re-derives this exact table; keep the two in sync.
export const MINES_PAYOUTS = { 1: 8, 2: 10, 3: 12, 4: 16, 5: 22, 6: 30, 7: 43 };
export const MINES_MAX_PICKS = 7;
const TILES = 16;
const MINES = 3;
const GEMS = TILES - MINES;

function shuffledMines() {
  const idx = [...Array(TILES).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return new Set(idx.slice(0, MINES));
}

// ---------------------------------------------------------------------
// The 3D mines board. Game state (revealed map, phase, dig/cashOut)
// stays in the React component above; this stage renders the 4x4
// board as chunky 3D tiles on a framed slab — lids flip away, gems
// rise and spin, mines are spiky black spheres. Taps raycast to the
// tile index and call the same dig() the buttons used.
// ---------------------------------------------------------------------
function MinesStage3D({ liveRef, digRef }) {
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
      const H = 400;
      const renderer = createRenderer(THREE);
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b1120);
      scene.fog = new THREE.Fog(0x0b1120, 1000, 2400);
      const camera = new THREE.PerspectiveCamera(48, 1, 1, 4000);
      camera.position.set(200, 196, 452);
      camera.lookAt(200, 208, 0);

      scene.add(new THREE.HemisphereLight(0xd8e6ff, 0x1c2436, 1.5));
      const sun = new THREE.DirectionalLight(0xfff2cf, 2.0);
      sun.position.set(140, 300, 520);
      scene.add(sun);
      const fill = new THREE.DirectionalLight(0x7fd0ff, 0.5);
      fill.position.set(-240, 120, 260);
      scene.add(fill);

      // framed slab with the club's mines art
      {
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(384, 384, 16),
          new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.45, metalness: 0.5 })
        );
        frame.position.set(200, 200, -10);
        scene.add(frame);
        const tex = new THREE.TextureLoader().load('/art/mines-bg.webp', (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
        });
        const top = new THREE.Mesh(
          new THREE.PlaneGeometry(368, 368),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, color: 0x8f9789 })
        );
        top.position.set(200, 200, -1.5);
        scene.add(top);
      }

      const tilePos = (i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return { x: 75.5 + col * 83, y: 324.5 - row * 83 };
      };
      const tiles = [];
      const gemGeo = new THREE.OctahedronGeometry(20, 0);
      const gemMat = new THREE.MeshStandardMaterial({ color: 0x2ee66b, roughness: 0.12, emissive: 0x2ee66b, emissiveIntensity: 0.5, flatShading: true });
      const mineMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.35, metalness: 0.45 });
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x39445c, roughness: 0.4, metalness: 0.5 });
      for (let i = 0; i < 16; i++) {
        const { x, y } = tilePos(i);
        const g = new THREE.Group();
        g.position.set(x, y, 0);
        const socket = new THREE.Mesh(
          new THREE.BoxGeometry(79, 79, 8),
          new THREE.MeshStandardMaterial({ color: 0x11182b, roughness: 0.8 })
        );
        socket.position.z = 2;
        g.add(socket);
        // content (hidden until revealed)
        const content = new THREE.Group();
        content.visible = false;
        const gem = new THREE.Mesh(gemGeo, gemMat);
        gem.scale.y = 1.3;
        gem.position.z = 17;
        gem.visible = false;
        content.add(gem);
        const mine = new THREE.Group();
        const core = new THREE.Mesh(new THREE.SphereGeometry(17.5, 16, 12), mineMat);
        mine.add(core);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const spike = new THREE.Mesh(new THREE.ConeGeometry(4.4, 12, 6), spikeMat);
          spike.position.set(Math.cos(a) * 18, Math.sin(a) * 18, 0);
          spike.rotation.z = a - Math.PI / 2;
          mine.add(spike);
        }
        mine.position.z = 17;
        mine.visible = false;
        content.add(mine);
        g.add(content);
        // lid: gold-trimmed glossy tile
        const lidG = new THREE.Group();
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(77, 77, 6),
          new THREE.MeshStandardMaterial({ color: 0xc79a2e, roughness: 0.35, metalness: 0.6 })
        );
        trim.position.z = 8;
        lidG.add(trim);
        const lidMatI = new THREE.MeshStandardMaterial({ color: 0x40537a, roughness: 0.28, metalness: 0.35, transparent: true });
        const lid = new THREE.Mesh(new THREE.BoxGeometry(71, 71, 10), lidMatI);
        lid.position.z = 12;
        lid.userData.tileIndex = i;
        lidG.add(lid);
        g.add(lidG);
        scene.add(g);
        tiles.push({ g, lidG, lid, lidMatI, content, gem, mine, shownAt: 0, kind: null });
      }
      const boomLight = new THREE.PointLight(0xff3b30, 0, 320);
      boomLight.position.z = 90;
      scene.add(boomLight);

      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      function onTap(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(tiles.map((t) => t.lid), false);
        if (hits.length) digRef.current?.(hits[0].object.userData.tileIndex);
      }
      renderer.domElement.addEventListener('pointerdown', onTap);

      function sync(now) {
        const L = liveRef.current || {};
        const revealed = L.revealed || {};
        tiles.forEach((t, i) => {
          const v = revealed[i];
          if (v && !t.kind) {
            t.kind = v;
            t.shownAt = now;
            t.content.visible = true;
            if (v === 'gem') t.gem.visible = true;
            else {
              t.mine.visible = true;
              boomLight.position.set(t.g.position.x, t.g.position.y, 90);
              boomLight.intensity = 260;
            }
          }
          if (t.kind) {
            const k = Math.min(1, (now - t.shownAt) / 300);
            // lid flips up and fades
            t.lidG.position.z = k * 30;
            t.lidG.position.y = k * 30;
            t.lidG.rotation.x = -k * 1.5;
            t.lidMatI.opacity = Math.max(0, 1 - k * 2.1);
            t.lid.visible = k < 0.5;
            // content pops in with overshoot, gems idle-spin
            const s = 0.4 + 0.6 * Math.min(1, (now - t.shownAt) / 240) + Math.max(0, Math.sin(Math.min(1, (now - t.shownAt) / 240) * Math.PI) * 0.12);
            t.content.scale.set(s, s, s);
            if (t.kind === 'gem') {
              t.gem.rotation.y = now / 620;
              t.gem.position.z = 17 + Math.sin(now / 340 + i) * 2.2;
            }
          }
        });
        boomLight.intensity = Math.max(0, boomLight.intensity - 9);
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
  }, [liveRef, digRef]);

  return (
    <div
      ref={mountRef}
      style={{ position: 'relative', width: '100%', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', margin: '0 auto', maxWidth: 400 }}
    />
  );
}


export default function Mines({ onFinish }) {
  const mines = useRef(shuffledMines());
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);
  const [revealed, setRevealed] = useState({}); // idx -> 'gem' | 'mine'
  const [phase, setPhase] = useState('dig'); // dig | done
  const [msg, setMsg] = useState('Pick a tile — where are the gems? 💎');
  const liveRef = useRef({ revealed: {}, phase: 'dig' });
  const digRef = useRef(null);

  liveRef.current = { revealed, phase };
  digRef.current = dig;
  const picks = Object.values(revealed).filter((v) => v === 'gem').length;
  const pot = picks > 0 ? MINES_PAYOUTS[picks] : 0;
  const nextPot = MINES_PAYOUTS[picks + 1];
  const safeChance =
    phase === 'dig' ? Math.round(((GEMS - picks) / (TILES - picks)) * 100) : 0;

  const haptic = (style) => {
    try {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    } catch {
      /* not in Telegram */
    }
  };

  function finish(outcome, amount, delay) {
    if (finished.current) return;
    finished.current = true;
    setPhase('done');
    setTimeout(() => {
      onFinish({
        outcome,
        amount,
        picks,
        durationMs: Date.now() - mountedAt.current,
      });
    }, delay);
  }

  function dig(i) {
    if (phase !== 'dig' || revealed[i] !== undefined) return;
    if (mines.current.has(i)) {
      haptic('heavy');
      // Reveal every mine on the bust.
      const all = { ...revealed, [i]: 'mine' };
      mines.current.forEach((m) => (all[m] = 'mine'));
      setRevealed(all);
      setMsg(`💣 BOOM! ${picks > 0 ? `Your ${pot} PTS pot is gone.` : 'A mine on the first dig — brutal.'}`);
      finish('bust', 0, 1500);
      return;
    }
    haptic('light');
    const newPicks = picks + 1;
    setRevealed((r) => ({ ...r, [i]: 'gem' }));
    if (newPicks >= MINES_MAX_PICKS) {
      setMsg(`💎 ${MINES_MAX_PICKS} gems! The board auto-banks ${MINES_PAYOUTS[newPicks]} PTS — max dig!`);
      finish('win', MINES_PAYOUTS[newPicks], 1200);
    } else {
      setMsg(`💎 Gem ${newPicks}! Cash out ${MINES_PAYOUTS[newPicks]} PTS, or dig for ${MINES_PAYOUTS[newPicks + 1]}?`);
    }
  }

  function cashOut() {
    if (phase !== 'dig' || picks < 1) return;
    haptic('medium');
    setMsg(`💰 Banked ${pot} PTS after ${picks} gem${picks > 1 ? 's' : ''}. Smart digging!`);
    finish('win', pot, 800);
  }

  return (
    <main className="mines-wrap">
      <h2 className="mines-title">💣 FRG MINES 3D</h2>
      <p className="mines-sub">
        16 tiles, 13 gems, 3 mines. Every gem raises the prize — one mine
        takes it all.
      </p>

      <div className="mines-status">
        <span>
          💎 <b>{picks}</b>/{MINES_MAX_PICKS}
        </span>
        <span className="mines-pot">
          {picks > 0 ? `CASH OUT: ${pot} PTS` : 'NO GEMS YET'}
        </span>
        <span>{phase === 'dig' ? `NEXT SAFE: ${safeChance}%` : '—'}</span>
      </div>

      <MinesStage3D liveRef={liveRef} digRef={digRef} />

      <p className="mines-msg">{msg}</p>

      {phase === 'dig' && picks >= 1 && (
        <button className="btn btn-big btn-bank" onClick={cashOut}>
          💰 CASH OUT {pot} PTS
        </button>
      )}
      <p className="mines-note">
        Payouts by gems dug: 1→8 · 2→10 · 3→12 · 4→16 · 5→22 · 6→30 ·
        7→43 PTS. The board auto-banks at 7 gems.
      </p>
    </main>
  );
}
