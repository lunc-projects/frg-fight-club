import { useEffect, useMemo, useRef, useState } from 'react';
import { createRenderer } from './gl.js';

// FRG Prize Wheel — now a REAL 3D wheel (Three.js). "Extra safe"
// tuning (owner's choice): the average
// payout (5.83 PTS) stays well under the 10 PTS entry, so the treasury
// grows over time. Segment layout mirrors the server's WHEEL_PRIZES.
export const WHEEL_SEGMENTS = [
  { label: '10', value: 10, color: '#7b2ff7', text: '#fff' },
  { label: 'BUST', value: 0, color: '#241433', text: '#8d7bb5' },
  { label: '5', value: 5, color: '#b8860b', text: '#fff7d6' },
  { label: 'BUST', value: 0, color: '#241433', text: '#8d7bb5' },
  { label: '20', value: 20, color: '#f7b733', text: '#3a2200' },
  { label: '5', value: 5, color: '#8e24aa', text: '#fff' },
  { label: 'BUST', value: 0, color: '#241433', text: '#8d7bb5' },
  { label: '15', value: 15, color: '#6a1fd0', text: '#fff' },
  { label: 'BUST', value: 0, color: '#241433', text: '#8d7bb5' },
  { label: '10', value: 10, color: '#b8860b', text: '#fff7d6' },
  { label: '5', value: 5, color: '#5b21b6', text: '#fff' },
  { label: 'BUST', value: 0, color: '#241433', text: '#8d7bb5' },
];
const N = WHEEL_SEGMENTS.length;
const CONFETTI = [
  { e: '⭐', l: '6%', d: '0s', t: '1.7s', s: 21 }, { e: '🎉', l: '16%', d: '0.15s', t: '1.9s', s: 22 },
  { e: '💰', l: '27%', d: '0.05s', t: '1.6s', s: 20 }, { e: '✨', l: '38%', d: '0.25s', t: '1.8s', s: 19 },
  { e: '⭐', l: '49%', d: '0.1s', t: '1.65s', s: 23 }, { e: '🎉', l: '59%', d: '0.3s', t: '1.95s', s: 21 },
  { e: '💰', l: '68%', d: '0.02s', t: '1.75s', s: 20 }, { e: '✨', l: '77%', d: '0.2s', t: '1.6s', s: 19 },
  { e: '⭐', l: '86%', d: '0.12s', t: '1.85s', s: 22 }, { e: '🎉', l: '94%', d: '0.28s', t: '1.7s', s: 20 },
];
const STEP = 360 / N;
const CX = 200, CY = 200, R = 168;
const DURATION = 4800;

function polar(r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

let actx = null;
function tickSound() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = 1900;
    g.gain.setValueAtTime(0.05, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.03);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.035);
  } catch { /* audio is a bonus */ }
}

// ---------------------------------------------------------------------
// The 3D wheel. The spin itself is still driven by the original CSS-
// transition machinery on an invisible proxy element (same easing,
// same transitionend finish, same tick sampler). This stage reads the
// proxy's computed rotation every frame and turns a REAL 3D wheel —
// textured face, gold rim, hub, legs, and 24 rim bulbs that chase
// with the same phase as the old SVG bulbs. Presentation only.
// ---------------------------------------------------------------------
function WheelStage3D({ proxyRef, liveRef }) {
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
      const renderer = createRenderer(THREE, { alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(W, H, false);
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(47, 1, 1, 3000);
      camera.position.set(200, 208, 505);
      camera.lookAt(200, 200, 0);

      scene.add(new THREE.HemisphereLight(0xfff2d8, 0x241433, 1.6));
      const key = new THREE.DirectionalLight(0xfff6dd, 2.2);
      key.position.set(120, 300, 420);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0xc4b5fd, 0.7);
      rim.position.set(-240, 80, 240);
      scene.add(rim);

      // ---- wheel face texture: the SVG layout, drawn on a canvas ----
      function faceTexture() {
        const cv = document.createElement('canvas');
        cv.width = 1024;
        cv.height = 1024;
        const c = cv.getContext('2d');
        const C = 512;
        const K = 1024 / 400; // SVG units -> texture px
        const pol = (r, deg) => {
          const a = ((deg - 90) * Math.PI) / 180;
          return [C + r * K * Math.cos(a), C + r * K * Math.sin(a)];
        };
        WHEEL_SEGMENTS.forEach((seg, i) => {
          const a0 = i * STEP;
          const a1 = a0 + STEP;
          c.beginPath();
          c.moveTo(C, C);
          c.arc(C, C, R * K, ((a0 - 90) * Math.PI) / 180, ((a1 - 90) * Math.PI) / 180);
          c.closePath();
          c.fillStyle = seg.color;
          c.fill();
          c.strokeStyle = '#f7b733';
          c.lineWidth = 4;
          c.stroke();
          const mid = a0 + STEP / 2;
          const [tx, ty] = pol(R * 0.72, mid);
          c.save();
          c.translate(tx, ty);
          c.rotate((mid * Math.PI) / 180);
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillStyle = seg.text;
          c.font = `900 ${seg.label.length > 2 ? 52 : 72}px system-ui`;
          c.fillText(seg.label, 0, 0);
          if (seg.label !== 'BUST') {
            c.font = '700 28px system-ui';
            c.globalAlpha = 0.85;
            c.fillText('PTS', 0, 58);
            c.globalAlpha = 1;
          }
          c.restore();
        });
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        return tex;
      }

      const wheel = new THREE.Group();
      wheel.position.set(200, 204, 0);
      scene.add(wheel);
      {
        const faceTex = faceTexture();
        const sideMat = new THREE.MeshStandardMaterial({ color: 0xc78f0a, roughness: 0.35, metalness: 0.6 });
        const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 });
        const backMat = new THREE.MeshStandardMaterial({ color: 0x241433, roughness: 0.7 });
        const geo = new THREE.CylinderGeometry(168, 168, 20, 48);
        geo.rotateX(Math.PI / 2);
        const disc = new THREE.Mesh(geo, [sideMat, faceMat, backMat]);
        wheel.add(disc);
        const rimT = new THREE.Mesh(
          new THREE.TorusGeometry(172, 9, 12, 56),
          new THREE.MeshStandardMaterial({ color: 0xf7b733, roughness: 0.28, metalness: 0.65, emissive: 0xf7b733, emissiveIntensity: 0.18 })
        );
        rimT.position.z = 2;
        wheel.add(rimT);
      }
      // rim bulbs (own materials — they chase in pairs)
      const bulbMats = [];
      const bulbMeshes = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const m = new THREE.MeshStandardMaterial({ color: 0xffe9a3, roughness: 0.3, emissive: 0xffe9a3, emissiveIntensity: 1 });
        const b = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 8), m);
        b.position.set(200 + Math.cos(a) * 186, 204 + Math.sin(a) * 186, 8);
        scene.add(b);
        bulbMats.push(m);
        bulbMeshes.push(b);
      }
      // static hub (does not spin, like the SVG overlay)
      {
        const hubCv = document.createElement('canvas');
        hubCv.width = 256;
        hubCv.height = 256;
        const hc = hubCv.getContext('2d');
        hc.beginPath();
        hc.arc(128, 128, 126, 0, Math.PI * 2);
        hc.fillStyle = '#e8a90c';
        hc.fill();
        hc.strokeStyle = '#f7b733';
        hc.lineWidth = 10;
        hc.stroke();
        hc.fillStyle = '#3a2200';
        hc.textAlign = 'center';
        hc.font = '900 62px system-ui';
        hc.fillText('FRG', 128, 124);
        hc.fillStyle = '#5b3a00';
        hc.font = '700 30px system-ui';
        hc.fillText('PRIZE WHEEL', 128, 168);
        const hubTex = new THREE.CanvasTexture(hubCv);
        hubTex.colorSpace = THREE.SRGBColorSpace;
        const hubGeo = new THREE.CylinderGeometry(47, 47, 30, 28);
        hubGeo.rotateX(Math.PI / 2);
        const hub = new THREE.Mesh(hubGeo, [
          new THREE.MeshStandardMaterial({ color: 0xc78f0a, roughness: 0.35, metalness: 0.6 }),
          new THREE.MeshStandardMaterial({ map: hubTex, roughness: 0.45 }),
          new THREE.MeshStandardMaterial({ color: 0x241433, roughness: 0.7 }),
        ]);
        hub.position.set(200, 204, 8);
        hub.rotation.z = Math.PI / 2;
        scene.add(hub);
      }
      // stand: two legs + feet
      {
        const legMat = new THREE.MeshStandardMaterial({ color: 0x3b2a63, roughness: 0.5, metalness: 0.4 });
        for (const s of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(16, 150, 14), legMat);
          leg.position.set(200 + s * 62, 66, -16);
          leg.rotation.z = s * -0.32;
          scene.add(leg);
          const foot = new THREE.Mesh(new THREE.BoxGeometry(74, 12, 26), legMat);
          foot.position.set(200 + s * 86, 4, -16);
          scene.add(foot);
        }
      }

      function currentAngle() {
        const el = proxyRef.current;
        if (!el) return 0;
        try {
          const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
          return (Math.atan2(m.b, m.a) * 180) / Math.PI;
        } catch {
          return 0;
        }
      }

      const frame = () => {
        raf = requestAnimationFrame(frame);
        const deg = currentAngle();
        wheel.rotation.z = (-deg * Math.PI) / 180;
        const phase = liveRef.current?.bulbPhase || 0;
        for (let i = 0; i < 24; i++) {
          const on = (i + phase) % 2 === 0;
          bulbMats[i].emissiveIntensity = on ? 1.5 : 0.12;
          bulbMats[i].color.set(on ? 0xffe9a3 : 0x8a6d1f);
        }
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
  }, [proxyRef, liveRef]);

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />;
}


export default function PrizeWheel({ onFinish }) {
  const spinRef = useRef(null);
  const pointerRef = useRef(null);
  const rotationRef = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null); // { value } after stop
  const [bulbPhase, setBulbPhase] = useState(0);
  const liveRef = useRef({ bulbPhase: 0 });
  liveRef.current = { bulbPhase };

  useEffect(() => {
    const id = setInterval(() => setBulbPhase((p) => p + 1), 450);
    return () => clearInterval(id);
  }, []);

  function spin() {
    if (spinning) return;
    const layer = spinRef.current;
    if (!layer) return;
    setSpinning(true);
    setResult(null);
    const startedAt = performance.now();

    const target = Math.floor(Math.random() * N);
    const jitter = (Math.random() - 0.5) * (STEP - 14);
    const centerAngle = target * STEP + STEP / 2;
    const rotation = rotationRef.current;
    const current = ((rotation % 360) + 360) % 360;
    let delta = (360 - centerAngle + jitter - current + 360) % 360;
    delta += 360 * (5 + Math.floor(Math.random() * 2));
    const end = rotation + delta;

    // Read-only sampler: tick sounds + pointer flick as segments pass.
    let lastIdx = Math.floor(current / STEP);
    const sampler = setInterval(() => {
      try {
        const m = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
        const a = ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
        const idx = Math.floor(a / STEP);
        if (idx !== lastIdx) {
          lastIdx = idx; tickSound();
          if (pointerRef.current) {
            pointerRef.current.style.transform = 'translateX(-50%) rotate(14deg)';
            setTimeout(() => { if (pointerRef.current) pointerRef.current.style.transform = 'translateX(-50%) rotate(0deg)'; }, 70);
          }
        }
      } catch { /* sampler is decorative */ }
      if (performance.now() - startedAt > DURATION + 600) clearInterval(sampler);
    }, 30);

    let done = false;
    const finishOnce = () => {
      if (done) return; done = true;
      clearInterval(sampler);
      rotationRef.current = end;
      const seg = WHEEL_SEGMENTS[target];
      const durationMs = Math.round(performance.now() - startedAt);
      setResult({ value: seg.value });
      setSpinning(false);
      if (seg.value > 0) { tickSound(); setTimeout(tickSound, 120); setTimeout(tickSound, 240); }
      // Let the player see the wheel result, then hand over to the
      // claim / bust screens in App.
      setTimeout(() => onFinish({ prize: seg.value, durationMs }), 1800);
    };
    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      layer.removeEventListener('transitionend', onEnd);
      finishOnce();
    };
    layer.addEventListener('transitionend', onEnd);
    setTimeout(finishOnce, DURATION + 700);

    layer.style.transition = 'none';
    layer.style.transform = `rotate(${rotation}deg)`;
    void layer.getBoundingClientRect();
    layer.style.transition = `transform ${DURATION}ms cubic-bezier(.12,.68,.08,1)`;
    layer.style.transform = `rotate(${end}deg)`;
  }

  return (
    <main className="pw">
      <h2 className="section">🎡 FRG Prize Wheel 3D</h2>
      <div className="pw-wrap">
        <div className="pw-rays" />
        <div className="pw-pointer" ref={pointerRef} />
        <div ref={spinRef} style={{ position: 'absolute', inset: 0, opacity: 0.001, pointerEvents: 'none' }} />
        <WheelStage3D proxyRef={spinRef} liveRef={liveRef} />
        {result && result.value > 0 && (
          <div className="pw-confetti" key={result.value}>
            {CONFETTI.map((c, i) => (
              <span key={i} style={{ left: c.l, animationDelay: c.d, animationDuration: c.t, fontSize: c.s }}>
                {c.e}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={`pw-result ${result ? (result.value > 0 ? 'win' : 'bust') : ''}`} aria-live="polite">
        {result === null && (spinning ? 'Spinning… good luck!' : 'Your spin is paid for — tap SPIN!')}
        {result && result.value > 0 && (result.value >= 20 ? `🎉 TOP PRIZE — ${result.value} PTS!` : `🎉 You won ${result.value} PTS!`)}
        {result && result.value === 0 && 'BUST — no prize this spin.'}
      </div>
      <button className="btn btn-big pw-spinbtn" disabled={spinning || result !== null} onClick={spin}>
        {spinning ? 'SPINNING…' : 'SPIN'}
      </button>
      <p className="fineprint">Top prize 20 PTS · 5 BUST segments on the wheel — the wheel decides.</p>
    </main>
  );
}
