import { useEffect, useMemo, useRef, useState } from 'react';

// FRG Prize Wheel — "extra safe" tuning (owner's choice): the average
// payout (5.83 FRG) stays well under the 10 FRG entry, so the treasury
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

export default function PrizeWheel({ onFinish }) {
  const spinRef = useRef(null);
  const pointerRef = useRef(null);
  const rotationRef = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null); // { value } after stop
  const [bulbPhase, setBulbPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setBulbPhase((p) => p + 1), 450);
    return () => clearInterval(id);
  }, []);

  const segments = useMemo(
    () =>
      WHEEL_SEGMENTS.map((s, i) => {
        const a0 = i * STEP, a1 = a0 + STEP;
        const [x0, y0] = polar(R, a0), [x1, y1] = polar(R, a1);
        const mid = a0 + STEP / 2, [tx, ty] = polar(R * 0.72, mid);
        return (
          <g key={i}>
            <path d={`M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1} Z`} fill={s.color} stroke="#f7b733" strokeWidth="1.5" />
            <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize={s.label.length > 2 ? 19 : 26} fontWeight="900" fill={s.text} transform={`rotate(${mid} ${tx} ${ty})`}>
              {s.label}
            </text>
            {s.label !== 'BUST' && (
              <text x={tx} y={ty + 22} textAnchor="middle" fontSize="10" fontWeight="700" fill={s.text} opacity=".85" transform={`rotate(${mid} ${tx} ${ty + 22})`}>
                FRG
              </text>
            )}
          </g>
        );
      }),
    []
  );

  const bulbs = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => {
        const [bx, by] = polar(183, i * 15);
        return <circle key={i} cx={bx} cy={by} r="6" fill={(i + bulbPhase) % 2 ? '#8a6d1f' : '#ffe9a3'} />;
      }),
    [bulbPhase]
  );

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
      <h2 className="section">🎡 FRG Prize Wheel</h2>
      <div className="pw-wrap">
        <div className="pw-pointer" ref={pointerRef} />
        <svg className="pw-layer pw-spin" ref={spinRef} viewBox="0 0 400 400">
          <g>{segments}</g>
        </svg>
        <svg className="pw-layer pw-static" viewBox="0 0 400 400">
          <circle cx="200" cy="200" r="192" fill="none" stroke="#f7b733" strokeWidth="6" />
          <g>{bulbs}</g>
          <circle cx="200" cy="200" r="46" fill="#e8a90c" stroke="#f7b733" strokeWidth="4" />
          <text x="200" y="194" textAnchor="middle" fontSize="21" fontWeight="900" fill="#3a2200">FRG</text>
          <text x="200" y="216" textAnchor="middle" fontSize="11" fontWeight="700" fill="#5b3a00">PRIZE WHEEL</text>
        </svg>
      </div>
      <div className={`pw-result ${result ? (result.value > 0 ? 'win' : 'bust') : ''}`} aria-live="polite">
        {result === null && (spinning ? 'Spinning… good luck!' : 'Your spin is paid for — tap SPIN!')}
        {result && result.value > 0 && (result.value >= 20 ? `🎉 TOP PRIZE — ${result.value} FRG!` : `🎉 You won ${result.value} FRG!`)}
        {result && result.value === 0 && 'BUST — no prize this spin.'}
      </div>
      <button className="btn btn-big pw-spinbtn" disabled={spinning || result !== null} onClick={spin}>
        {spinning ? 'SPINNING…' : 'SPIN'}
      </button>
      <p className="fineprint">Top prize 20 FRG · 5 BUST segments on the wheel — the wheel decides.</p>
    </main>
  );
}
