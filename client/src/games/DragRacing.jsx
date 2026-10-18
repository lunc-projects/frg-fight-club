import { useEffect, useRef, useState } from 'react';

// FRG Drag Racing — beat the tree, nail the shifts, outrun the rival.
//
// Skill model (simulation-tuned, 5k races per profile): the tach
// sweeps each of 5 gears; shifting at 78-95% is PERFECT (boost 1.30),
// 55-78% is good, earlier bogs the car (1.4s momentum loss), riding
// into the 100% limiter is worst. A great launch (<=220ms reaction)
// earns a 1.18 boost. Rival runs 9.60-11.00s. Simulated win rates:
// pro ~87%, average ~33% (EV ~6.0 PTS on the 10 PTS entry at the
// 18 PTS prize), sloppy ~2% — the treasury grows on typical play.
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
    }, 50);
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
      <h2 className="race-title">🏎️ DRAG RACING</h2>
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

      <div className="track">
        <div className="lane">
          <span className="lane-tag">RIVAL</span>
          <div
            className="car rival-car"
            style={{ left: `${2 + S.rivalDist * 88}%` }}
          >
            🏎️
          </div>
        </div>
        <div className="lane">
          <span className="lane-tag">YOU</span>
          <div
            className="car player-car"
            style={{ left: `${2 + S.dist * 88}%` }}
          >
            🏎️
          </div>
        </div>
        <div className="finish-line" />
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
