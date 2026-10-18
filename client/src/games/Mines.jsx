import { useRef, useState } from 'react';

// FRG Mines — 16 tiles, 3 hidden mines, 13 gems. Every gem you dig
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

export default function Mines({ onFinish }) {
  const mines = useRef(shuffledMines());
  const mountedAt = useRef(Date.now());
  const finished = useRef(false);
  const [revealed, setRevealed] = useState({}); // idx -> 'gem' | 'mine'
  const [phase, setPhase] = useState('dig'); // dig | done
  const [msg, setMsg] = useState('Pick a tile — where are the gems? 💎');

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
      <h2 className="mines-title">💣 FRG MINES</h2>
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

      <div className="mines-grid">
        {[...Array(TILES).keys()].map((i) => {
          const v = revealed[i];
          return (
            <button
              key={i}
              className={`mtile ${v === 'gem' ? 'gem' : v === 'mine' ? 'mine' : ''}`}
              onClick={() => dig(i)}
              disabled={v !== undefined || phase !== 'dig'}
              aria-label={`Tile ${i + 1}`}
            >
              {v === 'gem' ? (
                <img className="mtile-img" src="/art/slice-gem.webp" alt="gem" draggable="false" />
              ) : v === 'mine' ? (
                <img className="mtile-img" src="/art/slice-bomb.webp" alt="mine" draggable="false" />
              ) : (
                ''
              )}
            </button>
          );
        })}
      </div>

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
