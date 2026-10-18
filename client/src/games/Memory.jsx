import { useEffect, useRef, useState } from 'react';

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
      <h2 className="game-title">🧠 FRG MEMORY</h2>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '6px 0' }}>
        <span>ROUND <b>{round}</b></span>
        <span>SCORE <b>{score}</b></span>
        <span>{'✖'.repeat(strikes)}{'·'.repeat(Math.max(0, 3 - strikes))}</span>
      </div>
      <div style={{ position: 'relative' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          background: badFlash
            ? '#450a0a'
            : "linear-gradient(rgba(9,13,26,0.80), rgba(9,13,26,0.88)), url('/covers/memory.webp') center / cover",
          padding: 14,
          borderRadius: 16,
          transition: 'background 150ms',
        }}
      >
        {PADS.map((p, i) => (
          <button
            key={p.name}
            onClick={() => M.current?.press(i)}
            style={{
              height: 128,
              borderRadius: 14,
              border: 'none',
              fontSize: 40,
              color: '#111827',
              background: `linear-gradient(165deg, rgba(255,255,255,${
                lit === i ? 0.38 : 0.20
              }), rgba(255,255,255,0) 44%, rgba(0,0,0,0.22)), ${lit === i ? p.color : p.dim}`,
              boxShadow:
                lit === i
                  ? `0 0 36px ${p.color}, 0 0 12px ${p.color}, inset 0 0 22px rgba(255,255,255,0.45), 0 8px 18px rgba(0,0,0,0.4)`
                  : 'inset 0 -8px 0 rgba(0,0,0,0.30), inset 0 3px 0 rgba(255,255,255,0.16), 0 6px 14px rgba(0,0,0,0.35)',
              transform: lit === i ? 'scale(1.05)' : 'scale(1)',
              transition: 'background 90ms, box-shadow 90ms, transform 90ms',
              cursor: phase === 'input' ? 'pointer' : 'default',
            }}
          >
            {p.icon}
          </button>
        ))}
      </div>
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
