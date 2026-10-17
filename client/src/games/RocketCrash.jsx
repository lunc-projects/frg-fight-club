import { useEffect, useRef, useState } from 'react';

// FRG Rocket Crash — ride the multiplier, bail before it blows.
//
// Treasury-safe tuning (same rule as the wheel): the crash curve is
// P(reach t) = 0.65 / t at every target, so the expected payout is
// ~6.5 FRG on the 10 FRG entry no matter when the player bails — the
// treasury keeps ~3.5 FRG per launch on average. Max cash-out is 5.00x
// (50 FRG), which also keeps a single win inside the treasury float.
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

export default function RocketCrash({ onFinish }) {
  const [phase, setPhase] = useState('count'); // count | fly | cashed | crashed
  const [mult, setMult] = useState(1);
  const [trail, setTrail] = useState([]);
  const crashAt = useRef(drawCrashPoint());
  const flyStart = useRef(null);
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);

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

  // Trail → SVG points. x: 0..16s across 300 units; y: log scale to 5x.
  const pts = trail
    .map((p) => {
      const x = Math.min(300, (p.t / 16) * 300);
      const y = 190 - (Math.log(Math.max(1, p.m)) / Math.log(CRASH_MAX_MULT)) * 170;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const headX = Math.min(96, ((trail[trail.length - 1]?.t || 0) / 16) * 100);
  const headY = (Math.log(Math.max(1, mult)) / Math.log(CRASH_MAX_MULT)) * 82;

  return (
    <main className="crash-wrap">
      <h2 className="crash-title">🚀 ROCKET CRASH</h2>
      <p className="crash-sub">
        Ride the multiplier — bail before it blows. Max win 50 FRG at 5.00×.
      </p>

      <div className={`crash-stage ${phase === 'crashed' ? 'crash-boom' : ''}`}>
        <svg className="crash-trail" viewBox="0 0 300 200" preserveAspectRatio="none">
          {pts && (
            <polyline
              points={pts}
              fill="none"
              stroke={phase === 'crashed' ? '#ef4444' : '#4ade80'}
              strokeWidth="2.5"
            />
          )}
        </svg>
        {phase !== 'crashed' ? (
          <div
            className="crash-rocket"
            style={{ left: `${headX}%`, bottom: `${headY}%` }}
          >
            🚀
          </div>
        ) : (
          <div
            className="crash-rocket"
            style={{ left: '50%', bottom: '42%', fontSize: 64 }}
          >
            💥
          </div>
        )}
        <div className="crash-mult">
          {phase === 'count' && '🚀 Launching…'}
          {phase === 'fly' && fmt(mult)}
          {phase === 'cashed' && `✅ Bailed at ${fmt(mult)}`}
          {phase === 'crashed' && `💥 Crashed at ${fmt(mult)}`}
        </div>
        {phase === 'fly' && (
          <div className="crash-now">
            {mult >= CRASH_MIN_CASH
              ? `Bail now for ${payout} FRG`
              : `Cash-out unlocks at ${CRASH_MIN_CASH.toFixed(2)}×`}
          </div>
        )}
        {phase === 'cashed' && <div className="crash-now">{payout} FRG is yours — claim it next!</div>}
      </div>

      <button
        className="btn btn-big btn-cash"
        disabled={!canCash}
        onClick={() => cashOut(mult)}
      >
        {phase === 'fly'
          ? canCash
            ? `💰 CASH OUT — ${payout} FRG`
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
