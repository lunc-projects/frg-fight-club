import { useRef, useState } from 'react';

// FRG Balloon Darts — 12 balloons, 3 darts. Eight balloons hide FRG
// prizes (sum 40), two are empty, two hide a BURST that zeroes the pot.
// After each dart the player may BANK the pot or throw again and risk
// it all. Monte-Carlo (300k games): throw-every-dart EV ≈ 6.57 FRG on
// the 10 FRG entry; even the best bank strategy only reaches ≈ 6.66 —
// the treasury keeps ~3.4 FRG a game either way. Max pot 27 FRG.
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

export default function BalloonDarts({ onFinish }) {
  const wall = useRef(shuffledWall());
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);
  const pops = useRef(0);
  const [revealed, setRevealed] = useState({});
  const [pot, setPot] = useState(0);
  const [phase, setPhase] = useState('aim'); // aim | done
  const [msg, setMsg] = useState('Tap a balloon — throw a dart! 🎯');

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
      setMsg(`💥 BURST BALLOON! Your pot of ${pot} FRG is gone!`);
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
          ? `🎯 Out of darts — pot locked at ${newPot} FRG!`
          : '🎯 Out of darts — and the pot is empty. Ouch.'
      );
      finish(newPot > 0 ? 'win' : 'bust', newPot, false, 1100);
    } else if (v > 0) {
      setMsg(`🎈 +${v} FRG in the pot! Bank it, or risk it on the next dart?`);
    } else {
      setMsg('🎈 Empty balloon… nothing inside. Darts left — keep going?');
    }
  }

  function bank() {
    if (phase !== 'aim' || pot <= 0) return;
    haptic('medium');
    setMsg(`🏦 Banked ${pot} FRG. Smart money walks away!`);
    finish('win', pot, false, 700);
  }

  const dartsLeft = DARTS - pops.current;

  return (
    <main className="darts-wrap">
      <h2 className="darts-title">🎈 BALLOON DARTS</h2>
      <p className="darts-sub">
        3 darts, 12 balloons. Build a pot — but two balloons hide a 💥
        that bursts it all.
      </p>

      <div className="darts-status">
        <span className="darts-darts">
          {'🎯'.repeat(Math.max(0, dartsLeft))}
          <span className="darts-used">{'🎯'.repeat(pops.current)}</span>
        </span>
        <span className="darts-pot">POT: {pot} FRG</span>
      </div>

      <div className="balloon-grid">
        {wall.current.map((_, i) => {
          const v = revealed[i];
          const isRevealed = v !== undefined;
          return (
            <button
              key={i}
              className={`balloon ${isRevealed ? 'revealed' : ''}`}
              style={{
                '--bc': COLORS[i],
                background: isRevealed ? '#1e293b' : COLORS[i],
                animationDelay: `${i * 0.17}s`,
              }}
              onClick={() => pop(i)}
              disabled={isRevealed || phase !== 'aim'}
              aria-label={`Balloon ${i + 1}`}
            >
              {isRevealed &&
                (v === -1 ? (
                  <span className="bval">💥</span>
                ) : v > 0 ? (
                  <span className="bval">+{v}</span>
                ) : (
                  <span className="bval bval-empty">empty</span>
                ))}
            </button>
          );
        })}
      </div>

      <p className="darts-msg">{msg}</p>

      {phase === 'aim' && pot > 0 && pops.current < DARTS && (
        <button className="btn btn-big btn-bank" onClick={bank}>
          🏦 BANK {pot} FRG
        </button>
      )}
      <p className="darts-note">
        Prizes in the wall: 12 · 9 · 6 · 5 · 3 · 2 · 2 · 1 FRG — plus two
        empties and two 💥. Max pot 27 FRG.
      </p>
    </main>
  );
}
